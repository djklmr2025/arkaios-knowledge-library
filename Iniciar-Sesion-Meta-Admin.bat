@echo off
title ARKAIOS - Sesion de Administrador de Meta
echo ===============================================================================
echo   ARKAIOS SOVEREIGN KNOWLEDGE - PUENTE DE ADMINISTRADOR DE META
echo ===============================================================================
echo.
echo  "Asegurate de iniciar sesion con tu cuenta de administrador de Meta
echo   cuando la aplicacion externa te lo solicite."
echo.
echo  Iniciando Google Chrome con perfil persistente aislado...
echo  Ruta de sesion: %~dp0.meta_admin_session
echo.
echo  [1] Tu sesion quedara guardada en esta maquina de forma permanente.
echo  [2] Los agentes podran acceder a publicaciones, borradores y videos con privilegios.
echo  [3] Solo necesitas iniciar sesion UNA SOLA VEZ.
echo ===============================================================================

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%~dp0.meta_admin_session" --no-first-run --no-default-browser-check "https://www.facebook.com/arkaiosIA"
echo.
echo Navegador abierto. Inicia sesion en Facebook y deja la ventana lista.
echo Puedes cerrar esta ventana cuando termines de iniciar sesion.
pause
