@echo off
title Enviar sistema-lab para o GitHub
chcp 65001 >nul
echo ========================================================
echo   ENVIANDO SISTEMA-LAB PARA O GITHUB (cardoso-ix)
echo ========================================================
echo.
cd /d %~dp0

echo 1. Verificando repositorio remoto...
git remote -v
echo.
echo 2. Enviando branch main para o GitHub...
git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   [SUCESSO] Codigo enviado com sucesso para o GitHub!
    echo   Acesse: https://github.com/cardoso-ix/sistema-lab
    echo ========================================================
) else (
    echo [AVISO] Houve um problema ao enviar. Verifique o login acima.
)
echo.
pause
