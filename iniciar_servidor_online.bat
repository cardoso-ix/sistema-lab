@echo off
title CalibHub Pro - Servidor & Tunel Online
chcp 65001 >nul
echo ========================================================
echo   CALIBHUB PRO - SISTEMA METROLÓGICO (ISO/IEC 17025)
echo   Inicializando Servidor Backend + Túnel Cloudflare...
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Inicia o servidor Node.js
start "CalibHub - Backend Server" cmd /c "node src/server.js"

:: 2. Aguarda 3 segundos para estabilização da porta 3000
timeout /t 3 /nobreak >nul

:: 3. Inicia o Cloudflare Tunnel
echo Servidor Node.js iniciado na porta 3000!
echo Abrindo túnel Cloudflare seguro...
echo (Mantenha esta janela aberta para manter o link online ativo)
echo.
.\tools\cloudflared.exe tunnel --url http://localhost:3000
