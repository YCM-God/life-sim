@echo off
rem Publish entry: locate node (PATH first, then DSH bundled runtime) and run publish.mjs
setlocal
if defined NODE_EXE set "NODE=%NODE_EXE%"
if not defined NODE for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE set "NODE=%%i"
if not defined NODE if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE (
  echo [ERROR] node not found. Install Node.js or set NODE_EXE.
  exit /b 1
)
"%NODE%" "%~dp0publish.mjs" %*
exit /b %ERRORLEVEL%
