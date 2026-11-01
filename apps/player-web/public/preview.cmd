@echo off
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for local preview.
  echo Install Node.js, then double-click preview.cmd again.
  pause
  exit /b 1
)
node.exe "%~dp0preview.mjs" %*
if errorlevel 1 pause
