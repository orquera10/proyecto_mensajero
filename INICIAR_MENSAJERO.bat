@echo off
title Mensajero Institucional
cd /d "%~dp0"
echo ========================================================
echo Iniciando Mensajero Institucional...
echo ========================================================
start "" ".\node_modules\electron\dist\electron.exe" .
exit
