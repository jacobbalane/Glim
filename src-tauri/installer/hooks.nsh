!macro NSIS_HOOK_PREUNINSTALL
  ; Remove only entries recorded in Glim's connector manifests, and the startup entry. Not when
  ; updating: Setup runs the old uninstaller with /UPDATE, and the agents stay connected.
  ; The helper exits successfully if already disconnected.
  ${If} $UpdateMode <> 1
    ExecWait '"$INSTDIR\glim-bridge.exe" disconnect-all'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Glim"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; "Also delete my usage history" removes the usage database from Glim's data folder. The
  ; backups of the agents' original settings stay.
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    Delete "$LOCALAPPDATA\Glim\usage.sqlite3"
    Delete "$LOCALAPPDATA\Glim\usage.sqlite3-wal"
    Delete "$LOCALAPPDATA\Glim\usage.sqlite3-shm"
  ${EndIf}
!macroend
