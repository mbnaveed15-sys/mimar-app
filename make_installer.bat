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
echo Creating Windows installer (NSIS)... This may take several minutes.
npx electron-builder --win nsis portable --x64
if %errorlevel% neq 0 (
  echo electron-builder failed.
  pause
  exit /b 1
)
echo.
echo Installer build complete. Look in the 'release' folder for Mimar-Setup-1.3.0.exe (installer) and Mimar-Portable-1.3.0.exe (no install needed).
pause
ENDLOCAL
