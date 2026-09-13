@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\AgentChat.lnk"

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%SCRIPT_DIR%launch.vbs\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'AgentChat - Direct AgentRouter Desktop App'; $s.Save()"

echo Desktop shortcut created at %SHORTCUT_PATH%!
pause
