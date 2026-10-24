!macro customInstall
  ${If} $keepShortcuts == "false"
    Push $0
    ; A fresh Script Host process also supports Windows environments where
    ; the installer's in-process shortcut COM calls fail after extraction.
    ${If} ${FileExists} "$SYSDIR\wscript.exe"
      FileOpen $0 "$PLUGINSDIR\canvas-shortcut.vbs" w
      FileWrite $0 'Set shell = CreateObject("WScript.Shell")$\r$\n'
      FileWrite $0 'Set link = shell.CreateShortcut(WScript.Arguments(0))$\r$\n'
      FileWrite $0 'link.TargetPath = WScript.Arguments(1)$\r$\n'
      FileWrite $0 'link.WorkingDirectory = WScript.Arguments(2)$\r$\n'
      FileWrite $0 'link.IconLocation = WScript.Arguments(1) & ",0"$\r$\n'
      FileWrite $0 'link.Description = "DY Canvas"$\r$\n'
      FileWrite $0 'link.Save$\r$\n'
      FileClose $0
      ${IfNot} ${FileExists} "$newStartMenuLink"
        ExecWait '"$SYSDIR\wscript.exe" //B //NoLogo "$PLUGINSDIR\canvas-shortcut.vbs" "$newStartMenuLink" "$appExe" "$INSTDIR"' $0
      ${EndIf}
      ${IfNot} ${isNoDesktopShortcut}
      ${AndIfNot} ${FileExists} "$newDesktopLink"
        ExecWait '"$SYSDIR\wscript.exe" //B //NoLogo "$PLUGINSDIR\canvas-shortcut.vbs" "$newDesktopLink" "$appExe" "$INSTDIR"' $0
      ${EndIf}
    ${EndIf}
    Pop $0
  ${EndIf}
!macroend
