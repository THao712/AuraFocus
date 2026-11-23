@echo off
chcp 65001 >nul
title AuraFocus 打包工具
echo 正在执行单文件免安装 EXE 打包...
python "%~dp0build_exe.py"
pause
