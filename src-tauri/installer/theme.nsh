; Glim: the installer's dark theme. The website's colors and 3D art on Tauri's NSIS wizard, for the
; installer and the uninstaller (the un. copies). installer.nsi includes it after its pages.
;
; Windows draws NSIS with system colors, so each part is set here:
; - the title bar and the window go dark (DWM, SetCtlColors), and the buttons take Windows' own
;   dark theme (DarkMode_Explorer);
; - MUI shows its etched lines again on every page, and on dark they read as white rules, so each
;   page hides them;
; - themed checkboxes ignore text colors (NSIS bug #443), so each keeps only its box and its words
;   move into a label beside it. The checkbox keeps its text for screen readers; it is just too
;   narrow to draw it;
; - the art is drawn at twice its size at 100% scaling and scaled to the page with HALFTONE, so it
;   stays sharp at any scaling.
; With high contrast on, Windows' own colors stay.

!define GLIM_BG "0A0B12"
!define GLIM_FG "FFFFFF"
!define GLIM_TEXT "A4A4B2"
!define GLIM_MUTED "6E6E7C"

Var GlimDpi
Var GlimY
Var GlimX
Var GlimBody
Var GlimSmall
Var GlimTitleFont
Var GlimHeadFont

!macro GLIM_THEME UN

; Pixels for a size at 100% scaling: Push size, Call, Pop.
Function ${UN}GlimPx
  Exch $0
  IntOp $0 $0 * $GlimDpi
  IntOp $0 $0 / 96
  Exch $0
FunctionEnd

; A bitmap file in a static control, scaled smoothly to the control: Push control, Push file.
Function ${UN}GlimArt
  Exch $1
  Exch
  Exch $0
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  Push $R7
  Push $R8
  Push $R9
  System::Call '*(i,i,i,i)p.r2'
  System::Call 'user32::GetClientRect(p r0, p r2)'
  System::Call '*$2(i,i,i.r3,i.r4)'
  System::Free $2
  System::Call 'user32::LoadImageW(p 0, w r1, i 0, i 0, i 0, i 0x10) p.r5'
  ${If} $5 <> 0
    System::Call '*(i,i,i,i,&i2,&i2,p)p.r2'
    System::Call 'gdi32::GetObjectW(p r5, i 24, p r2)'
    System::Call '*$2(i,i.r6,i.r7)'
    System::Free $2
    System::Call 'user32::GetDC(p 0) p.r2'
    System::Call 'gdi32::CreateCompatibleDC(p r2) p.r8'
    System::Call 'gdi32::CreateCompatibleDC(p r2) p.r9'
    System::Call 'gdi32::CreateCompatibleBitmap(p r2, i r3, i r4) p.R9'
    System::Call 'user32::ReleaseDC(p 0, p r2)'
    System::Call 'gdi32::SelectObject(p r8, p r5) p.R8'
    System::Call 'gdi32::SelectObject(p r9, p R9) p.R7'
    System::Call 'gdi32::SetStretchBltMode(p r9, i 4)'
    System::Call 'gdi32::SetBrushOrgEx(p r9, i 0, i 0, p 0)'
    System::Call 'gdi32::StretchBlt(p r9, i 0, i 0, i r3, i r4, p r8, i 0, i 0, i r6, i r7, i 0x00CC0020)'
    System::Call 'gdi32::SelectObject(p r8, p R8)'
    System::Call 'gdi32::SelectObject(p r9, p R7)'
    System::Call 'gdi32::DeleteDC(p r8)'
    System::Call 'gdi32::DeleteDC(p r9)'
    System::Call 'gdi32::DeleteObject(p r5)'
    SendMessage $0 ${STM_SETIMAGE} ${IMAGE_BITMAP} $R9 $2
    ${If} $2 <> 0
      System::Call 'gdi32::DeleteObject(p r2)'
    ${EndIf}
  ${EndIf}
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $0
  Pop $1
FunctionEnd

; Dark title bar, window, buttons, version line and page header.
Function ${UN}GlimGUIInit
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i.s'
  Pop $GlimDpi
  ${If} $GlimDpi < 96
    StrCpy $GlimDpi 96
  ${EndIf}
  CreateFont $GlimBody "Segoe UI" 10 400
  CreateFont $GlimSmall "Segoe UI" 9 400
  CreateFont $GlimTitleFont "Segoe UI" 19 700
  CreateFont $GlimHeadFont "Segoe UI Semibold" 12 600
  ${If} ${IsHighContrastModeActive}
    Return
  ${EndIf}
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i 0x120B0A, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 34, *i 0x2E2A2A, i 4)'
  SetCtlColors $HWNDPARENT ${GLIM_FG} ${GLIM_BG}
  ${ForEach} $0 1 3 + 1
    GetDlgItem $1 $HWNDPARENT $0
    System::Call 'uxtheme::SetWindowTheme(p r1, w "DarkMode_Explorer", p 0)'
  ${Next}
  ; The version line: one flat grey label instead of NSIS's etched pair.
  GetDlgItem $0 $HWNDPARENT 1256
  SetCtlColors $0 ${GLIM_MUTED} transparent
  SendMessage $0 ${WM_SETFONT} $GlimSmall 0
  ; The header: a bigger title over a grey subtitle, both at the page's left margin.
  GetDlgItem $0 $HWNDPARENT 1034
  System::Call '*(i,i,i,i)p.r2'
  System::Call 'user32::GetWindowRect(p r0, p r2)'
  System::Call 'user32::MapWindowPoints(p 0, p $HWNDPARENT, p r2, i 2)'
  System::Call '*$2(i.r3,i.r4,i.r5,i)'
  System::Free $2
  Push 26
  Call ${UN}GlimPx
  Pop $6
  IntOp $3 $3 + $6
  Push 214
  Call ${UN}GlimPx
  Pop $6
  IntOp $5 $5 - $3
  IntOp $5 $5 - $6
  Push 11
  Call ${UN}GlimPx
  Pop $6
  IntOp $4 $4 + $6
  Push 24
  Call ${UN}GlimPx
  Pop $6
  GetDlgItem $0 $HWNDPARENT 1037
  System::Call 'user32::SetWindowPos(p r0, p 0, i r3, i r4, i r5, i r6, i 0x14)'
  SendMessage $0 ${WM_SETFONT} $GlimHeadFont 0
  IntOp $4 $4 + $6
  Push 20
  Call ${UN}GlimPx
  Pop $6
  GetDlgItem $0 $HWNDPARENT 1038
  System::Call 'user32::SetWindowPos(p r0, p 0, i r3, i r4, i r5, i r6, i 0x14)'
  SendMessage $0 ${WM_SETFONT} $GlimBody 0
  SetCtlColors $0 ${GLIM_TEXT} ${GLIM_BG}
  GetDlgItem $0 $HWNDPARENT 1046
  Push $0
  Push "$PLUGINSDIR\glim-header.bmp"
  Call ${UN}GlimArt
FunctionEnd

; Every page: hide MUI's etched lines and the second half of the version line.
Function ${UN}GlimPage
  ${If} ${IsHighContrastModeActive}
    Return
  ${EndIf}
  Push $0
  GetDlgItem $0 $HWNDPARENT 1035
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1036
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1045
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1028
  ShowWindow $0 ${SW_HIDE}
  Pop $0
FunctionEnd

; A full-window page laid out like the website's hero: the art across the top, then the title and
; the text centered under it. Push page, Push image, Push title, Push text, Push art file. Leaves
; the y under the text in $GlimY, for what the page adds below it.
Function ${UN}GlimHero
  Exch $4
  Exch
  Exch $3
  Exch 2
  Exch $2
  Exch 3
  Exch $1
  Exch 4
  Exch $0
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  Call ${UN}GlimPage
  System::Call '*(i,i,i,i)p.r5'
  System::Call 'user32::GetClientRect(p r0, p r5)'
  System::Call '*$5(i,i,i.r6,i)'
  System::Free $5
  ; The art: the full width, 300/994 of it tall.
  IntOp $7 $6 * 300
  IntOp $7 $7 / 994
  System::Call 'user32::SetWindowPos(p r1, p 0, i 0, i 0, i r6, i r7, i 0x14)'
  Push $1
  Push $4
  Call ${UN}GlimArt
  ; The title, centered under it.
  Push 30
  Call ${UN}GlimPx
  Pop $8
  IntOp $9 $6 - $8
  IntOp $9 $9 - $8
  Push 2
  Call ${UN}GlimPx
  Pop $5
  IntOp $5 $5 + $7
  Push 38
  Call ${UN}GlimPx
  Pop $4
  System::Call 'user32::GetWindowLongW(p r2, i -16) i.r1'
  IntOp $1 $1 | 0x1
  System::Call 'user32::SetWindowLongW(p r2, i -16, i r1)'
  System::Call 'user32::SetWindowPos(p r2, p 0, i r8, i r5, i r9, i r4, i 0x14)'
  SendMessage $2 ${WM_SETFONT} $GlimTitleFont 0
  ; The text, a little narrower, centered under the title.
  IntOp $5 $5 + $4
  Push 46
  Call ${UN}GlimPx
  Pop $8
  IntOp $9 $6 - $8
  IntOp $9 $9 - $8
  Push 64
  Call ${UN}GlimPx
  Pop $4
  System::Call 'user32::GetWindowLongW(p r3, i -16) i.r1'
  IntOp $1 $1 | 0x1
  System::Call 'user32::SetWindowLongW(p r3, i -16, i r1)'
  System::Call 'user32::SetWindowPos(p r3, p 0, i r8, i r5, i r9, i r4, i 0x14)'
  SendMessage $3 ${WM_SETFONT} $GlimBody 0
  SetCtlColors $3 ${GLIM_TEXT} ${GLIM_BG}
  IntOp $GlimY $5 + $4
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $0
  Pop $4
  Pop $3
  Pop $2
  Pop $1
FunctionEnd

; How wide a checkbox's words are in the page's font: Push checkbox, Call, Pop width.
Function ${UN}GlimTextWidth
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  ${NSD_GetText} $0 $1
  StrLen $2 $1
  System::Call 'user32::GetDC(p r0) p.r3'
  System::Call 'gdi32::SelectObject(p r3, p $GlimBody) p.r4'
  System::Call '*(i,i)p.r5'
  System::Call 'gdi32::GetTextExtentPoint32W(p r3, w r1, i r2, p r5)'
  System::Call '*$5(i.r2,i)'
  System::Free $5
  System::Call 'gdi32::SelectObject(p r3, p r4)'
  System::Call 'user32::ReleaseDC(p r0, p r3)'
  StrCpy $0 $2
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

; A checkbox as a dark box with its words in a label beside it, at $GlimY: centered on the page,
; or, when $GlimX is set, from that left edge so a group lines up. Push page, Push checkbox. Moves
; $GlimY under it.
Function ${UN}GlimCheck
  Exch $1
  Exch
  Exch $0
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  ${NSD_GetText} $1 $2
  Push $1
  Call ${UN}GlimTextWidth
  Pop $7
  ; Box, gap, words.
  Push 15
  Call ${UN}GlimPx
  Pop $3
  Push 7
  Call ${UN}GlimPx
  Pop $4
  Push 22
  Call ${UN}GlimPx
  Pop $5
  System::Call '*(i,i,i,i)p.r6'
  System::Call 'user32::GetClientRect(p r0, p r6)'
  System::Call '*$6(i,i,i.r8,i)'
  System::Free $6
  IntOp $9 $3 + $4
  IntOp $9 $9 + $7
  IntOp $6 $8 - $9
  IntOp $6 $6 / 2
  ${If} $GlimX != ""
    StrCpy $6 $GlimX
  ${EndIf}
  System::Call 'user32::SetWindowPos(p r1, p 0, i r6, i $GlimY, i r3, i r5, i 0x14)'
  ${IfNot} ${IsHighContrastModeActive}
    System::Call 'uxtheme::SetWindowTheme(p r1, w "DarkMode_Explorer", p 0)'
  ${EndIf}
  IntOp $6 $6 + $3
  IntOp $6 $6 + $4
  IntOp $7 $7 + $4
  ; SS_CENTERIMAGE centers the words on the box's line.
  nsDialogs::CreateControl STATIC ${__NSD_Label_STYLE}|0x200 ${__NSD_Label_EXSTYLE} $6 $GlimY $7 $5 $2
  Pop $9
  SendMessage $9 ${WM_SETFONT} $GlimBody 0
  SetCtlColors $9 ${GLIM_FG} ${GLIM_BG}
  nsDialogs::SetUserData $9 $1
  ${NSD_OnClick} $9 ${UN}GlimToggle
  Push 4
  Call ${UN}GlimPx
  Pop $6
  IntOp $GlimY $GlimY + $5
  IntOp $GlimY $GlimY + $6
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $0
  Pop $1
FunctionEnd
Function ${UN}GlimToggle
  Pop $0
  nsDialogs::GetUserData $0
  Pop $1
  ${NSD_GetState} $1 $2
  ${If} $2 = ${BST_CHECKED}
    ${NSD_Uncheck} $1
  ${Else}
    ${NSD_Check} $1
  ${EndIf}
FunctionEnd

; The progress page: dark, with an indigo bar. Only Cancel stays in the footer.
Function ${UN}GlimProgressShow
  Call ${UN}GlimPage
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  ${If} ${IsHighContrastModeActive}
    Return
  ${EndIf}
  FindWindow $0 "#32770" "" $HWNDPARENT
  SetCtlColors $0 ${GLIM_FG} ${GLIM_BG}
  GetDlgItem $1 $0 1006
  SetCtlColors $1 ${GLIM_TEXT} ${GLIM_BG}
  SendMessage $1 ${WM_SETFONT} $GlimBody 0
  GetDlgItem $1 $0 1004
  System::Call 'uxtheme::SetWindowTheme(p r1, w "", w "")'
  SendMessage $1 0x0409 0 0xF16663
  SendMessage $1 0x2001 0 0x271D1C
  GetDlgItem $1 $0 1027
  System::Call 'uxtheme::SetWindowTheme(p r1, w "DarkMode_Explorer", p 0)'
  GetDlgItem $1 $0 1016
  System::Call 'uxtheme::SetWindowTheme(p r1, w "DarkMode_Explorer", p 0)'
  SendMessage $1 0x1001 0 0x120B0A
  SendMessage $1 0x1026 0 0x120B0A
  SendMessage $1 0x1024 0 0xB2A4A4
FunctionEnd

; The last page: only its button.
Function ${UN}GlimFinishButtons
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
FunctionEnd
!macroend

!insertmacro GLIM_THEME ""
!insertmacro GLIM_THEME "un."

; The pages. Installing: what Setup will do, under the crowd of Glims; the happy crowd at the end.
Function GlimWelcomeShow
  Push $mui.WelcomePage
  Push $mui.WelcomePage.Image
  Push $mui.WelcomePage.Title
  Push $mui.WelcomePage.Text
  Push "$PLUGINSDIR\glim-welcome.bmp"
  Call GlimHero
  ${If} $GlimNote != ""
    System::Call '*(i,i,i,i)p.r0'
    System::Call 'user32::GetClientRect(p $mui.WelcomePage, p r0)'
    System::Call '*$0(i,i,i.r1,i.r2)'
    System::Free $0
    Push 40
    Call GlimPx
    Pop $3
    ; Room for three lines, should a long folder wrap.
    Push 52
    Call GlimPx
    Pop $4
    IntOp $1 $1 - $3
    IntOp $1 $1 - $3
    IntOp $2 $2 - $4
    Push 48
    Call GlimPx
    Pop $4
    nsDialogs::CreateControl STATIC ${__NSD_Label_STYLE}|0x1 ${__NSD_Label_EXSTYLE} $3 $2 $1 $4 $GlimNote
    Pop $0
    SendMessage $0 ${WM_SETFONT} $GlimSmall 0
    SetCtlColors $0 ${GLIM_MUTED} ${GLIM_BG}
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:$GlimButton"
FunctionEnd
Function GlimFinishShow
  Push $mui.FinishPage
  Push $mui.FinishPage.Image
  Push $mui.FinishPage.Title
  Push $mui.FinishPage.Text
  Push "$PLUGINSDIR\glim-finish.bmp"
  Call GlimHero
  Push $mui.FinishPage.Run
  Call GlimTextWidth
  Pop $0
  Push $mui.FinishPage.ShowReadme
  Call GlimTextWidth
  Pop $1
  ${If} $1 > $0
    StrCpy $0 $1
  ${EndIf}
  Push 22
  Call GlimPx
  Pop $1
  IntOp $0 $0 + $1
  System::Call '*(i,i,i,i)p.r1'
  System::Call 'user32::GetClientRect(p $mui.FinishPage, p r1)'
  System::Call '*$1(i,i,i.r2,i)'
  System::Free $1
  IntOp $GlimX $2 - $0
  IntOp $GlimX $GlimX / 2
  Push $mui.FinishPage
  Push $mui.FinishPage.Run
  Call GlimCheck
  Push $mui.FinishPage
  Push $mui.FinishPage.ShowReadme
  Call GlimCheck
  StrCpy $GlimX ""
  Call GlimFinishButtons
FunctionEnd

; Uninstalling: Glim awake under the night sky, then asleep.
Function un.GlimWelcomeShow
  Push $mui.WelcomePage
  Push $mui.WelcomePage.Image
  Push $mui.WelcomePage.Title
  Push $mui.WelcomePage.Text
  Push "$PLUGINSDIR\glim-welcome.bmp"
  Call un.GlimHero
  ${NSD_CreateCheckbox} 0 0 10 10 "$(deleteAppData)"
  Pop $DeleteAppDataCheckbox
  SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $GlimBody 0
  Push $mui.WelcomePage
  Push $DeleteAppDataCheckbox
  Call un.GlimCheck
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:Uninstall"
FunctionEnd
Function un.GlimFinishShow
  Push $mui.FinishPage
  Push $mui.FinishPage.Image
  Push $mui.FinishPage.Title
  Push $mui.FinishPage.Text
  Push "$PLUGINSDIR\glim-finish.bmp"
  Call un.GlimHero
  Call un.GlimFinishButtons
FunctionEnd
