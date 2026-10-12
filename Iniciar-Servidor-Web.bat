@echo off
title ARKAIOS Knowledge Library & Meta Bridge Server
echo ===============================================================================
echo   ARKAIOS MEDIA KNOWLEDGE ENGINE - SERVIDOR WEB LOCAL
echo ===============================================================================
echo.
echo   Servidor activo en: http://localhost:8989
echo   Abriendo navegador...
echo.
start "" "http://localhost:8989"
node "%~dp0server.js"
pause
