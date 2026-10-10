param([Parameter(Mandatory=$true)][int]$GlimProcessId)
$ErrorActionPreference = 'Stop'
# Read-only Win32 inspection: no mouse input, global display changes, or focus changes.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class GlimRegionProbe {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; public POINT(int x, int y) { X=x; Y=y; } }
  public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr param);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern int GetWindowRgn(IntPtr hwnd, IntPtr region);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder name, int length);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int left, int top, int right, int bottom);
  [DllImport("gdi32.dll")] public static extern int GetRgnBox(IntPtr region, out RECT rect);
  [DllImport("gdi32.dll")] public static extern bool PtInRegion(IntPtr region, int x, int y);
  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr handle);
  public static IntPtr Find(uint processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hwnd, param) => {
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      if (pid == processId && IsWindowVisible(hwnd)) { found = hwnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string Describe(IntPtr hwnd) {
    uint pid; GetWindowThreadProcessId(hwnd, out pid);
    var name = new StringBuilder(256); GetClassName(hwnd, name, name.Capacity);
    return string.Format("{0}: pid={1}, class={2}", hwnd, pid, name);
  }
}
'@
$glimOldDpi = [GlimRegionProbe]::SetThreadDpiAwarenessContext([IntPtr](-4))
$glimRegion = [GlimRegionProbe]::CreateRectRgn(0,0,0,0)
try {
  $glimWindow = [GlimRegionProbe]::Find($GlimProcessId)
  if ($glimWindow -eq [IntPtr]::Zero) { throw 'No visible Glim window for this test process.' }
  if ([GlimRegionProbe]::GetWindowRgn($glimWindow, $glimRegion) -le 1) { throw 'Missing native window region.' }
  $glimBounds = New-Object GlimRegionProbe+RECT
  $glimWindowRect = New-Object GlimRegionProbe+RECT
  $null = [GlimRegionProbe]::GetRgnBox($glimRegion, [ref]$glimBounds)
  $null = [GlimRegionProbe]::GetWindowRect($glimWindow, [ref]$glimWindowRect)
  $glimCenterX = [int](($glimBounds.Left + $glimBounds.Right) / 2)
  $glimBelow = New-Object GlimRegionProbe+POINT ($glimWindowRect.Left + $glimCenterX), ($glimWindowRect.Top + $glimBounds.Bottom)
  $glimInside = New-Object GlimRegionProbe+POINT ($glimWindowRect.Left + $glimCenterX), ($glimWindowRect.Top + 2)
  $glimBelowWindow = [GlimRegionProbe]::GetAncestor([GlimRegionProbe]::WindowFromPoint($glimBelow), 2)
  $glimInsideWindow = [GlimRegionProbe]::GetAncestor([GlimRegionProbe]::WindowFromPoint($glimInside), 2)
  [ordered]@{
    dpi = [GlimRegionProbe]::GetDpiForWindow($glimWindow)
    window = $glimWindowRect
    region = $glimBounds
    lastRowInside = [GlimRegionProbe]::PtInRegion($glimRegion, $glimCenterX, $glimBounds.Bottom - 1)
    firstRowBelowOutside = -not [GlimRegionProbe]::PtInRegion($glimRegion, $glimCenterX, $glimBounds.Bottom)
    actualHitInside = ($glimInsideWindow -eq $glimWindow)
    actualHitBelowPassesThrough = ($glimBelowWindow -ne $glimWindow)
    targetWindow = [GlimRegionProbe]::Describe($glimWindow)
    insideHitWindow = [GlimRegionProbe]::Describe($glimInsideWindow)
    belowHitWindow = [GlimRegionProbe]::Describe($glimBelowWindow)
  } | ConvertTo-Json -Depth 3 -Compress
} finally {
  $null = [GlimRegionProbe]::DeleteObject($glimRegion)
  $null = [GlimRegionProbe]::SetThreadDpiAwarenessContext($glimOldDpi)
}
