@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo Bluff Battle - Netlify deployment
echo ================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
echo [1/4] Installing project dependencies...
call npm install
if errorlevel 1 goto failed
echo.
echo [2/4] Sign in to Netlify. A browser window will open if needed...
call npx --yes netlify-cli login
if errorlevel 1 goto failed
echo.
echo [3/4] Link this folder to your existing Bluff Battle Netlify site...
call npx --yes netlify-cli link
if errorlevel 1 goto failed
echo.
echo [4/4] Building and deploying frontend AND serverless function to production...
call npx --yes netlify-cli deploy --prod
if errorlevel 1 goto failed
echo.
echo Deployment command completed. Verify the function at:
echo https://YOUR-SITE.netlify.app/.netlify/functions/game?health=1
echo Expected response: {"ok":true,"function":"game","blobs":"available"}
echo.
echo If the health check fails, open Netlify Functions logs and share the error.
pause
exit /b 0
:failed
echo.
echo Deployment stopped because a command failed. Copy the error shown above and share it.
pause
exit /b 1
