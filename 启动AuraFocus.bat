@echo off
chcp 65001 >nul
title AuraFocus 启动器

if exist "%~dp0dist\AuraFocus.exe" (
    echo 正在启动独立单文件免安装版 AuraFocus.exe ...
    start "" "%~dp0dist\AuraFocus.exe"
) else (
    echo 正在通过 Python 环境直接运行 AuraFocus ...
    start "" pythonw "%~dp0app.py"
)
exit
