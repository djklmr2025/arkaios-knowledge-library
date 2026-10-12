@echo off
title ARKAIOS - Sincronizador de Conocimiento Facebook
echo ========================================================
echo  ARKAIOS - Sincronizando con facebook.com/arkaiosIA
echo ========================================================
node "%~dp0sync_worker.js"
echo.
pause
