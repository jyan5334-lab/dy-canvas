!macro customInstall
  Push $0
  Push $1
  Push $2
  StrCpy $1 "false"
  StrCpy $2 "false"
  ${If} $keepShortcuts == "false"
    StrCpy $2 "true"
    ${IfNot} ${isNoDesktopShortcut}
      StrCpy $1 "true"
    ${EndIf}
  ${EndIf}
  ; Refresh existing links even when NSIS keeps them during an online update.
  ${If} ${FileExists} "$SYSDIR\wscript.exe"
    File /oname=$PLUGINSDIR\refresh-shortcuts.vbs "${BUILD_RESOURCES_DIR}\refresh-shortcuts.vbs"
    ExecWait '"$SYSDIR\wscript.exe" //B //NoLogo "$PLUGINSDIR\refresh-shortcuts.vbs" "$appExe" "$INSTDIR\resources\DYcanvas-${VERSION}.ico" "${SHORTCUT_NAME}" "$newDesktopLink" "$newStartMenuLink" "$oldDesktopLink" "$oldStartMenuLink" "$1" "$2"' $0
    ${If} $0 != 0
      DetailPrint "Shortcut refresh could not finish. Windows shortcuts may need to be recreated."
    ${EndIf}
  ${EndIf}
  ${If} ${FileExists} "$newDesktopLink"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x2000, i 0x5, w "$newDesktopLink", p 0)'
  ${EndIf}
  ${If} ${FileExists} "$newStartMenuLink"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x2000, i 0x5, w "$newStartMenuLink", p 0)'
  ${EndIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
  Pop $2
  Pop $1
  Pop $0
!macroend
