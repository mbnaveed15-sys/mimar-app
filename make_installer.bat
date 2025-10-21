@echo off
REM Mimar 1.3 installer builder - one click build (Windows)
SETLOCAL
echo.
echo === Mimar 1.3 Installer Builder ===
echo This script will install dependencies and build the Mimar installer (Windows .exe).
echo.
pause
echo Installing dependencies (this may take several minutes)...
npm install
if %errorlevel% neq 0 (
  echo npm install failed. Please ensure Node.js is installed and try again.
  pause
  exit /b 1
)
echo Building client (Vite)...
npm run build
if %errorlevel% neq 0 (
  echo Client build failed.
  pause
  exit /b 1
)
echo Installing electron-builder...
npm install --save-dev electron-builder
if %errorlevel% neq 0 (
  echo Installing electron-builder failed.
  pause
  exit /b 1
)
echo Creating Windows installer (NSIS)... This may take several minutes.
npx electron-builder --win nsis --config.extraMetadata.version=1.3.0
if %errorlevel% neq 0 (
  echo electron-builder failed.
  pause
  exit /b 1
)
echo.
echo Installer build complete. Look for Mimar-Setup-1.3.0.exe in the 'out' folder.
pause
ENDLOCAL
