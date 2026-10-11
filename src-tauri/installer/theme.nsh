; Glim: the installer's dark theme. The website's colors and moving 3D Glims on Tauri's NSIS
; wizard, for the installer and the uninstaller (the un. copies). installer.nsi includes it after
; its pages.
;
; Windows draws NSIS with system colors, so each part is set here:
; - the title bar and the window go dark (DWM, SetCtlColors), and the buttons take Windows' own
;   dark theme (DarkMode_Explorer);
; - MUI shows its etched lines again on every page, and on dark they read as white rules, so each
;   page hides them;
; - checkboxes take the same dark theme, which draws their words light (Windows' default theme
;   ignores text colors, NSIS bug #443), and the page color fills behind them;
; - focus outlines and access-key underlines show once the keyboard is used, as Windows does;
; - the banners move: a timer draws each frame from a background and sprites (art.nsh), at twice
;   the size the banner shows at 100% scaling, then scales it to the page with HALFTONE, so it stays
;   sharp at any scaling. With Windows' animation effects off, the banner holds still.
; With high contrast on, Windows' own colors stay.

!define GLIM_BG "0A0B12"
!define GLIM_FG "FFFFFF"
!define GLIM_TEXT "A4A4B2"
!define GLIM_MUTED "6E6E7C"

!include "${__FILEDIR__}\art.nsh"

Var GlimDpi
Var GlimY
Var GlimX
Var GlimBody
Var GlimSmall
Var GlimTitleFont
Var GlimHeadFont
; The moving banner: the control it shows in, the eyes it wears (the atlas row: 0 open, 1 closed,
; 2 happy), whether the crowd hops, the frame, and the GDI objects that draw it.
Var GlimAnimControl
Var GlimAnimMood
Var GlimAnimHop
Var GlimFrame
Var GlimBg
Var GlimBgDC
Var GlimBgOld
Var GlimAtlas
Var GlimAtlasDC
Var GlimAtlasOld
Var GlimBack
Var GlimBackDC
Var GlimBackOld
Var GlimOut
Var GlimOutDC
Var GlimOutW
Var GlimOutH

; One Glim on the banner, for the frame in $GlimFrame: it bobs, blinks now and then, and on the
; finish page hops once. art.nsh gives its place and its moves. Uses $1 to $3.
!macro GLIM_SPRITE IN X Y W H AX ROW PHASE EVERY AT HOP
  IntOp $1 $GlimFrame + ${PHASE}
  Push $1
  Call ${IN}GlimBob
  Pop $2
  ${If} $GlimAnimHop = 1
    IntOp $1 $GlimFrame - ${HOP}
    Push $1
    Call ${IN}GlimHop
    Pop $1
    IntOp $2 $2 + $1
  ${EndIf}
  IntOp $2 $2 + ${Y}
  ; The last two frames of each round of EVERY are a blink.
  IntOp $1 $GlimFrame + ${AT}
  IntOp $1 $1 % ${EVERY}
  IntOp $1 $1 + 2
  StrCpy $3 $GlimAnimMood
  ${If} $1 >= ${EVERY}
    StrCpy $3 1
  ${EndIf}
  IntOp $3 $3 * ${ROW}
  System::Call 'msimg32::AlphaBlend(p $GlimBackDC, i ${X}, i r2, i ${W}, i ${H}, p $GlimAtlasDC, i ${AX}, i r3, i ${W}, i ${H}, i 0x01FF0000)'
!macroend

; A sleep Z, for the frame in $GlimFrame: in turn with the others it fades in, rises, drifts and
; fades out, every 72 frames. Uses $1 to $4.
!macro GLIM_Z X Y W H AX AY DELAY
  IntOp $1 $GlimFrame - ${DELAY}
  ${If} $1 >= 0
    IntOp $1 $1 % 72
    IntOp $2 $1 * 46
    IntOp $2 $2 / 72
    IntOp $2 ${Y} - $2
    IntOp $3 $1 * 12
    IntOp $3 $3 / 72
    IntOp $3 ${X} + $3
    ${If} $1 < 12
      IntOp $4 $1 * 8
    ${ElseIf} $1 < 48
      StrCpy $4 96
    ${Else}
      IntOp $4 72 - $1
      IntOp $4 $4 * 4
    ${EndIf}
    IntOp $4 $4 << 16
    IntOp $4 $4 | 0x01000000
    System::Call 'msimg32::AlphaBlend(p $GlimBackDC, i r3, i r2, i ${W}, i ${H}, p $GlimAtlasDC, i ${AX}, i ${AY}, i ${W}, i ${H}, i r4)'
  ${EndIf}
!macroend

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
  ; Focus outlines and access-key underlines wait for the keyboard (WM_CHANGEUISTATE, UIS_SET,
  ; UISF_HIDEFOCUS | UISF_HIDEACCEL), as in Windows' own dialogs.
  SendMessage $HWNDPARENT 0x0127 0x30001 0
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

; A full-window page laid out like the website's hero: the banner across the top (GlimAnimStart
; draws it), then the title and the text centered under it. Push page, Push image, Push title,
; Push text. Leaves the y under the text in $GlimY, for what the page adds below it.
Function ${UN}GlimHero
  Exch $3
  Exch
  Exch $2
  Exch 2
  Exch $1
  Exch 3
  Exch $0
  Push $4
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
  ; The banner: the full width, as tall as its art in proportion.
  IntOp $7 $6 * ${GLIM_BANNER_H}
  IntOp $7 $7 / ${GLIM_BANNER_W}
  System::Call 'user32::SetWindowPos(p r1, p 0, i 0, i 0, i r6, i r7, i 0x14)'
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
  Pop $4
  Pop $0
  Pop $3
  Pop $2
  Pop $1
FunctionEnd

; A gentle bob: Push frame, Call, Pop the offset in banner pixels, up to 6 either way over 48 frames.
; The sine is Bhaskara's approximation, in whole numbers: 16x(24-x) / (5*24*24 - 4x(24-x)).
Function ${UN}GlimBob
  Exch $0
  Push $1
  Push $2
  Push $3
  IntOp $0 $0 % 48
  StrCpy $3 -1
  ${If} $0 >= 24
    IntOp $0 $0 - 24
    StrCpy $3 1
  ${EndIf}
  IntOp $1 24 - $0
  IntOp $1 $1 * $0
  IntOp $2 $1 * 4
  IntOp $2 2880 - $2
  IntOp $1 $1 * 96
  IntOp $1 $1 / $2
  IntOp $0 $1 * $3
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

; A hop of 20 banner pixels over 12 frames: Push frames since it began, Call, Pop the offset.
Function ${UN}GlimHop
  Exch $0
  Push $1
  Push $2
  ${If} $0 < 0
  ${OrIf} $0 >= 12
    StrCpy $0 0
  ${Else}
    IntOp $1 12 - $0
    IntOp $1 $1 * $0
    IntOp $2 $1 * 4
    IntOp $2 720 - $2
    IntOp $1 $1 * 320
    IntOp $1 $1 / $2
    IntOp $0 0 - $1
  ${EndIf}
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

; The banner for the frame in $GlimFrame: the background, the Glims (and, asleep, the Zs), the fade
; at the bottom, then the whole frame scaled to the page.
Function ${UN}GlimDraw
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  System::Call 'gdi32::BitBlt(p $GlimBackDC, i 0, i 0, i ${GLIM_BANNER_W}, i ${GLIM_BANNER_H}, p $GlimBgDC, i 0, i 0, i 0x00CC0020)'
  !if "${UN}" == ""
    !insertmacro GLIM_DRAW_CROWD ""
    StrCpy $0 ${GLIM_CROWD_FADE_Y}
  !else
    !insertmacro GLIM_DRAW_SKY "${UN}"
    ${If} $GlimAnimMood = 1
      !insertmacro GLIM_DRAW_ZS
    ${EndIf}
    StrCpy $0 ${GLIM_SKY_FADE_Y}
  !endif
  System::Call 'msimg32::AlphaBlend(p $GlimBackDC, i 0, i ${GLIM_FADE_TOP}, i ${GLIM_BANNER_W}, i ${GLIM_FADE_H}, p $GlimAtlasDC, i 0, i r0, i 4, i ${GLIM_FADE_H}, i 0x01FF0000)'
  ; Scaled into the banner's own bitmap, then copied straight onto the control. Nothing is
  ; invalidated, so nothing else on the page repaints, and nothing flickers.
  System::Call 'gdi32::SelectObject(p $GlimOutDC, p $GlimOut) p.r2'
  System::Call 'gdi32::SetStretchBltMode(p $GlimOutDC, i 4)'
  System::Call 'gdi32::SetBrushOrgEx(p $GlimOutDC, i 0, i 0, p 0)'
  System::Call 'gdi32::StretchBlt(p $GlimOutDC, i 0, i 0, i $GlimOutW, i $GlimOutH, p $GlimBackDC, i 0, i 0, i ${GLIM_BANNER_W}, i ${GLIM_BANNER_H}, i 0x00CC0020)'
  System::Call 'user32::GetDC(p $GlimAnimControl) p.r1'
  System::Call 'gdi32::BitBlt(p r1, i 0, i 0, i $GlimOutW, i $GlimOutH, p $GlimOutDC, i 0, i 0, i 0x00CC0020)'
  System::Call 'user32::ReleaseDC(p $GlimAnimControl, p r1)'
  System::Call 'gdi32::SelectObject(p $GlimOutDC, p r2)'
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
Function ${UN}GlimTick
  IntOp $GlimFrame $GlimFrame + 1
  Call ${UN}GlimDraw
FunctionEnd

; Starts the banner in a page's image control: Push control, Push eyes (0 open, 1 closed, 2 happy),
; Push 1 for the finish page's hop or 0. Draws the first frame at once, then one every 66ms.
Function ${UN}GlimAnimStart
  Pop $GlimAnimHop
  Pop $GlimAnimMood
  Pop $GlimAnimControl
  StrCpy $GlimFrame 0
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\glim-banner.bmp", i 0, i 0, i 0, i 0x10) p.s'
  Pop $GlimBg
  ; The sprites keep their alpha: a DIB section, as AlphaBlend needs.
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\glim-sprites.bmp", i 0, i 0, i 0, i 0x2010) p.s'
  Pop $GlimAtlas
  System::Call '*(i,i,i,i)p.r0'
  System::Call 'user32::GetClientRect(p $GlimAnimControl, p r0)'
  System::Call '*$0(i,i,i.r1,i.r2)'
  System::Free $0
  StrCpy $GlimOutW $1
  StrCpy $GlimOutH $2
  System::Call 'user32::GetDC(p 0) p.r0'
  System::Call 'gdi32::CreateCompatibleDC(p r0) p.s'
  Pop $GlimBgDC
  System::Call 'gdi32::CreateCompatibleDC(p r0) p.s'
  Pop $GlimAtlasDC
  System::Call 'gdi32::CreateCompatibleDC(p r0) p.s'
  Pop $GlimBackDC
  System::Call 'gdi32::CreateCompatibleDC(p r0) p.s'
  Pop $GlimOutDC
  System::Call 'gdi32::CreateCompatibleBitmap(p r0, i ${GLIM_BANNER_W}, i ${GLIM_BANNER_H}) p.s'
  Pop $GlimBack
  System::Call 'gdi32::CreateCompatibleBitmap(p r0, i $GlimOutW, i $GlimOutH) p.s'
  Pop $GlimOut
  System::Call 'user32::ReleaseDC(p 0, p r0)'
  System::Call 'gdi32::SelectObject(p $GlimBgDC, p $GlimBg) p.s'
  Pop $GlimBgOld
  System::Call 'gdi32::SelectObject(p $GlimAtlasDC, p $GlimAtlas) p.s'
  Pop $GlimAtlasOld
  System::Call 'gdi32::SelectObject(p $GlimBackDC, p $GlimBack) p.s'
  Pop $GlimBackOld
  ; With Windows' animation effects off (SPI_GETCLIENTAREAANIMATION), one still frame: every Glim
  ; awake, and asleep with the Zs in the air.
  System::Call 'user32::SystemParametersInfoW(i 0x1042, i 0, *i .r0, i 0)'
  ${If} $0 = 0
    StrCpy $GlimFrame 54
  ${EndIf}
  Call ${UN}GlimDraw
  ; The control keeps the banner's bitmap for its own repaints, such as when uncovered.
  SendMessage $GlimAnimControl ${STM_SETIMAGE} ${IMAGE_BITMAP} $GlimOut
  ${If} $0 <> 0
    ${NSD_CreateTimer} ${UN}GlimTick 66
  ${EndIf}
FunctionEnd

; Stops the banner when its page goes, and lets go of what drew it.
Function ${UN}GlimAnimStop
  ${If} $GlimAnimControl == ""
    Return
  ${EndIf}
  ${NSD_KillTimer} ${UN}GlimTick
  SendMessage $GlimAnimControl ${STM_SETIMAGE} ${IMAGE_BITMAP} 0
  System::Call 'gdi32::SelectObject(p $GlimBgDC, p $GlimBgOld)'
  System::Call 'gdi32::SelectObject(p $GlimAtlasDC, p $GlimAtlasOld)'
  System::Call 'gdi32::SelectObject(p $GlimBackDC, p $GlimBackOld)'
  System::Call 'gdi32::DeleteDC(p $GlimBgDC)'
  System::Call 'gdi32::DeleteDC(p $GlimAtlasDC)'
  System::Call 'gdi32::DeleteDC(p $GlimBackDC)'
  System::Call 'gdi32::DeleteDC(p $GlimOutDC)'
  System::Call 'gdi32::DeleteObject(p $GlimBg)'
  System::Call 'gdi32::DeleteObject(p $GlimAtlas)'
  System::Call 'gdi32::DeleteObject(p $GlimBack)'
  System::Call 'gdi32::DeleteObject(p $GlimOut)'
  StrCpy $GlimAnimControl ""
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

; A checkbox on the dark page, at $GlimY: centered, or, when $GlimX is set, from that left edge so a
; group lines up. Windows' dark theme draws its box and its words; the page color fills behind them.
; Push page, Push checkbox. Moves $GlimY under it.
Function ${UN}GlimCheck
  Exch $1
  Exch
  Exch $0
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  SendMessage $1 ${WM_SETFONT} $GlimBody 0
  ${IfNot} ${IsHighContrastModeActive}
    System::Call 'uxtheme::SetWindowTheme(p r1, w "DarkMode_Explorer", p 0)'
    SetCtlColors $1 ${GLIM_FG} ${GLIM_BG}
  ${EndIf}
  ; Windows leaves only a hair between the box and its words; a space gives them room.
  ${NSD_GetText} $1 $2
  ${NSD_SetText} $1 " $2"
  ; The box, the gap Windows leaves after it, the words, and room for the focus outline.
  Push $1
  Call ${UN}GlimTextWidth
  Pop $2
  Push 28
  Call ${UN}GlimPx
  Pop $3
  IntOp $2 $2 + $3
  Push 22
  Call ${UN}GlimPx
  Pop $3
  System::Call '*(i,i,i,i)p.r4'
  System::Call 'user32::GetClientRect(p r0, p r4)'
  System::Call '*$4(i,i,i.r5,i)'
  System::Free $4
  IntOp $6 $5 - $2
  IntOp $6 $6 / 2
  ${If} $GlimX != ""
    StrCpy $6 $GlimX
  ${EndIf}
  System::Call 'user32::SetWindowPos(p r1, p 0, i r6, i $GlimY, i r2, i r3, i 0x14)'
  Push 4
  Call ${UN}GlimPx
  Pop $4
  IntOp $GlimY $GlimY + $3
  IntOp $GlimY $GlimY + $4
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $0
  Pop $1
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

; The last page: only its button. The progress page hid it, and NSIS does not show it again.
Function ${UN}GlimFinishButtons
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_SHOW}
FunctionEnd
!macroend

!insertmacro GLIM_THEME ""
!insertmacro GLIM_THEME "un."

; The pages. Installing: what Setup will do, under the crowd of Glims; the crowd hops at the end.
Function GlimWelcomeShow
  Push $mui.WelcomePage
  Push $mui.WelcomePage.Image
  Push $mui.WelcomePage.Title
  Push $mui.WelcomePage.Text
  Call GlimHero
  Push $mui.WelcomePage.Image
  Push 0
  Push 0
  Call GlimAnimStart
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
  Call GlimHero
  Push $mui.FinishPage.Image
  Push 2
  Push 1
  Call GlimAnimStart
  Push $mui.FinishPage.Run
  Call GlimTextWidth
  Pop $0
  Push $mui.FinishPage.ShowReadme
  Call GlimTextWidth
  Pop $1
  ${If} $1 > $0
    StrCpy $0 $1
  ${EndIf}
  Push 28
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

; Uninstalling: Glim awake under the night sky, then asleep under rising Zs.
Function un.GlimWelcomeShow
  Push $mui.WelcomePage
  Push $mui.WelcomePage.Image
  Push $mui.WelcomePage.Title
  Push $mui.WelcomePage.Text
  Call un.GlimHero
  Push $mui.WelcomePage.Image
  Push 0
  Push 0
  Call un.GlimAnimStart
  ${NSD_CreateCheckbox} 0 0 10 10 "$(deleteAppData)"
  Pop $DeleteAppDataCheckbox
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
  Call un.GlimHero
  Push $mui.FinishPage.Image
  Push 1
  Push 0
  Call un.GlimAnimStart
  Call un.GlimFinishButtons
FunctionEnd
