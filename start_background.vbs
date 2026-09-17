Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\HP\.gemini\antigravity\scratch\AgentChat"
WshShell.Run """C:\Users\HP\AppData\Local\Programs\Python\Python314\pythonw.exe"" server.py", 0, False

