Option Explicit
Dim shell, fso, appExe, iconPath, brand, failed
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count <> 9 Then WScript.Quit 1
appExe = WScript.Arguments(0)
iconPath = WScript.Arguments(1)
brand = WScript.Arguments(2)
failed = False
If Not fso.FileExists(appExe) Or Not fso.FileExists(iconPath) Then WScript.Quit 1

Function OwnedLink(filename)
  On Error Resume Next
  Dim link
  OwnedLink = False
  If Not fso.FileExists(filename) Then Exit Function
  Set link = shell.CreateShortcut(filename)
  If Err.Number = 0 Then OwnedLink = (LCase(fso.GetAbsolutePathName(link.TargetPath)) = LCase(fso.GetAbsolutePathName(appExe)))
  Err.Clear
End Function

Sub RenameLegacy(oldPath, newPath)
  On Error Resume Next
  If LCase(oldPath) = LCase(newPath) Or Not OwnedLink(oldPath) Then Exit Sub
  If fso.FileExists(newPath) Then
    If OwnedLink(newPath) Then fso.DeleteFile oldPath, True
  Else
    fso.MoveFile oldPath, newPath
  End If
  If Err.Number <> 0 Then failed = True
  Err.Clear
End Sub

Sub Refresh(filename, allowCreate)
  On Error Resume Next
  Dim link
  If fso.FileExists(filename) Then
    If Not OwnedLink(filename) Then Exit Sub
  ElseIf Not allowCreate Then
    Exit Sub
  End If
  Set link = shell.CreateShortcut(filename)
  link.TargetPath = appExe
  link.WorkingDirectory = fso.GetParentFolderName(appExe)
  link.IconLocation = iconPath & ",0"
  link.Description = brand
  link.Save
  If Err.Number <> 0 Then failed = True
  Err.Clear
End Sub

RenameLegacy WScript.Arguments(5), WScript.Arguments(3)
RenameLegacy WScript.Arguments(6), WScript.Arguments(4)
Refresh WScript.Arguments(3), (WScript.Arguments(7) = "true")
Refresh WScript.Arguments(4), (WScript.Arguments(8) = "true")
If failed Then WScript.Quit 2
