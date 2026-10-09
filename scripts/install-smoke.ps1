param([string]$Installer = 'src-tauri/target/release/bundle/nsis/Glim_0.1.0_x64-setup.exe')
$ErrorActionPreference = 'Stop'
$glimWorkspace = (Get-Location).Path
$glimInstaller = (Resolve-Path -LiteralPath $Installer).Path
$glimUninstallRoots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
function Get-GlimInstall {
  foreach ($glimRegistryRoot in $glimUninstallRoots) {
    if (Test-Path -LiteralPath $glimRegistryRoot) {
      Get-ChildItem -LiteralPath $glimRegistryRoot | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'Glim' }
    }
  }
}
if (Get-GlimInstall) { throw 'An existing Glim installation is present. This test will not replace it.' }
if (Get-Process glim -ErrorAction SilentlyContinue) { throw 'Quit the running Glim app before this isolated test.' }
$glimRunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (Get-ItemProperty -LiteralPath $glimRunKey -Name Glim -ErrorAction SilentlyContinue) {
  throw 'An existing Glim startup entry is present. This test will not replace it.'
}
$glimShortcutPaths = @(
  (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Glim.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Glim.lnk')
)
foreach ($glimShortcut in $glimShortcutPaths) {
  if (Test-Path -LiteralPath $glimShortcut) { throw "Existing shortcut: $glimShortcut. This test will not replace it." }
}
$glimTestRoot = Join-Path $glimWorkspace ('.cache\installation-' + [Guid]::NewGuid().ToString('N'))
$glimInstallDir = [IO.Path]::GetFullPath((Join-Path $glimTestRoot 'app'))
$glimCacheRoot = [IO.Path]::GetFullPath((Join-Path $glimWorkspace '.cache')) + [IO.Path]::DirectorySeparatorChar
if (-not $glimInstallDir.StartsWith($glimCacheRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Installation target is outside the isolated workspace.'
}
New-Item -ItemType Directory -Path $glimTestRoot | Out-Null
$glimVariables = @('GLIM_DATA_DIR','GLIM_AGENT_HOME','GLIM_TEST_ROOT','GLIM_TEST_EXE','GLIM_TEST_BRIDGE','GLIM_TEST_KEEP_CONNECTORS')
$glimOldEnvironment = @{}
foreach ($glimVariable in $glimVariables) { $glimOldEnvironment[$glimVariable] = [Environment]::GetEnvironmentVariable($glimVariable, 'Process') }
function Run-Installer([string]$glimFile, [string]$glimArguments) {
  $glimProcess = Start-Process -FilePath $glimFile -ArgumentList $glimArguments -WindowStyle Hidden -PassThru
  $null = $glimProcess.Handle
  if (-not $glimProcess.WaitForExit(60000)) { throw 'Installer did not exit within 60 seconds.' }
  if ($glimProcess.ExitCode -ne 0) { throw "Installer exited with $($glimProcess.ExitCode)." }
}
$glimInstalled = $false
try {
  $env:GLIM_TEST_ROOT = Join-Path $glimTestRoot 'smoke'
  $env:GLIM_DATA_DIR = Join-Path $env:GLIM_TEST_ROOT 'data'
  $env:GLIM_AGENT_HOME = Join-Path $env:GLIM_TEST_ROOT 'agents'
  $env:GLIM_TEST_EXE = Join-Path $glimInstallDir 'glim.exe'
  $env:GLIM_TEST_BRIDGE = Join-Path $glimInstallDir 'glim-bridge.exe'
  $env:GLIM_TEST_KEEP_CONNECTORS = '1'
  # NSIS /D must be last; its entire remainder is the destination, including spaces.
  Run-Installer $glimInstaller "/S /D=$glimInstallDir"
  $glimInstalled = $true
  foreach ($glimFile in @('glim.exe','glim-bridge.exe','uninstall.exe','licenses\glim.txt','licenses\manrope.txt','licenses\react-bits.txt','licenses\third-party-notices.md')) {
    if (-not (Test-Path -LiteralPath (Join-Path $glimInstallDir $glimFile))) { throw "Missing installed file: $glimFile" }
  }
  $glimRegistration = @(Get-GlimInstall)
  if ($glimRegistration.Count -ne 1 -or $glimRegistration[0].InstallLocation.Trim('"') -ne $glimInstallDir) {
    throw 'Installed app registration does not match the isolated destination.'
  }
  if (Get-ItemProperty -LiteralPath $glimRunKey -Name Glim -ErrorAction SilentlyContinue) { throw 'Install enabled startup without user consent.' }
  Write-Output 'NSIS installation, bundled helper, licenses, and per-user registration verified.'
  node scripts/native-smoke.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Installed app integration failed.' }
  node scripts/restart-smoke.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Installed app restart check failed.' }
}
finally {
  if ($glimInstalled -or (Test-Path -LiteralPath (Join-Path $glimInstallDir 'uninstall.exe'))) {
    # Verify the absolute target before invoking the uninstaller that removes files.
    $glimVerifiedDir = [IO.Path]::GetFullPath($glimInstallDir)
    if (-not $glimVerifiedDir.StartsWith($glimCacheRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Refusing to uninstall outside the isolated workspace.'
    }
    Run-Installer (Join-Path $glimVerifiedDir 'uninstall.exe') '/S'
    # NSIS starts a temporary copy of itself; wait for that copy to finish cleanup.
    $glimUninstallDeadline = [DateTime]::UtcNow.AddSeconds(30)
    while ((Test-Path -LiteralPath (Join-Path $glimVerifiedDir 'glim.exe')) -or (Get-GlimInstall)) {
      if ([DateTime]::UtcNow -gt $glimUninstallDeadline) { throw 'Uninstall did not complete cleanup.' }
      Start-Sleep -Milliseconds 100
    }
  }
  foreach ($glimVariable in $glimVariables) { [Environment]::SetEnvironmentVariable($glimVariable, $glimOldEnvironment[$glimVariable], 'Process') }
}
if (Get-GlimInstall) { throw 'Uninstall registration remains.' }
foreach ($glimFile in @('glim.exe','glim-bridge.exe')) {
  if (Test-Path -LiteralPath (Join-Path $glimInstallDir $glimFile)) { throw "Uninstall left $glimFile." }
}
foreach ($glimShortcut in $glimShortcutPaths) {
  if (Test-Path -LiteralPath $glimShortcut) { throw "Uninstall left shortcut: $glimShortcut" }
}
if (Get-ItemProperty -LiteralPath $glimRunKey -Name Glim -ErrorAction SilentlyContinue) { throw 'Uninstall left a startup entry.' }
node scripts/verify-uninstall.mjs $glimTestRoot
if ($LASTEXITCODE -ne 0) { throw 'Uninstall restoration check failed.' }
Write-Output "Installation lifecycle passed. Isolated artifacts: $glimTestRoot"
