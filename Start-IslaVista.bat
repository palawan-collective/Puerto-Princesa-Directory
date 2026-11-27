@echo off
setlocal
cd /d "%~dp0source\islavista"
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)" >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22 or newer, then reopen this launcher. https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\next\package.json (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
call npm run local
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
