@echo off
title Asistente de Configuracion Meta Graph API - ARKAIOS
cd /d "C:\ARKAIOS\arkaios-knowledge-library"
cls
echo ======================================================================
echo  CONFIGURACION DE TOKENS META GRAPH API (CLAUDE & ARKAIOS)
echo ======================================================================
echo.
echo NOTA: Cuando te pida App Secret y Token, NO se mostraran las letras
echo por seguridad al escribir o pegar. Simplemente pega (Ctrl+V) y pulsa ENTER.
echo.
node setup-meta-env.mjs
echo.
echo ======================================================================
pause
