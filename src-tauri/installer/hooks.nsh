!macro NSIS_HOOK_PREUNINSTALL
  ; Remove only entries recorded in Glim's connector manifests. Keep user history unless
  ; the user cleared it in the app. The helper exits successfully if already disconnected.
  ExecWait '"$INSTDIR\glim-bridge.exe" disconnect-all'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Glim"
!macroend
