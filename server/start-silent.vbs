Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = dir

' 单实例检测
Set exec = WshShell.Exec("netstat -ano")
out = exec.StdOut.ReadAll()
If InStr(out, ":3000") > 0 And InStr(out, "LISTENING") > 0 Then
    WshShell.Run "http://localhost:3000"
    WScript.Quit
End If

If Not fso.FolderExists(dir & "\node_modules") Then
    WshShell.Run "cmd /c npm install --production", 1, True
End If

WshShell.Run "node server.js", 0, False
