@echo off
title ARKAIOS - Monitor Autonomo de Contenido (Daemon)
echo ========================================================
echo  ARKAIOS - Monitor de Publicaciones y Videos Activo
echo  Revisando cada 15 minutos sin requerir login ni keys...
echo ========================================================
node "%~dp0sync_worker.js" --watch 15
pause
