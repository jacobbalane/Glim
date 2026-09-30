# Glim Terminal Bridge

Connects this VS Code window's integrated terminals to the local Glim desktop app. It enumerates existing terminals, tracks new/closed terminals, and reconnects if Glim starts later.

The bridge uses a current-user Windows named pipe. It sends terminal names, opaque identities and shell process IDs. It does not read terminal output or send commands to terminals.

`Glim: Show Bridge Status` reports the connection. This is an early development build: exact-tab reveal is implemented, while cross-window foreground activation still needs native validation. Native Windows terminals only; WSL/remote support is not included.
