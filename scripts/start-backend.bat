@echo off
REM 启动 CrewAI 后端服务
REM 使用方法: scripts\start-backend.bat

cd /d "%~dp0..\submodules\saleagent\apps\agent"

if not exist "main.py" (
    echo 错误: 找不到 main.py 文件
    pause
    exit /b 1
)

echo 启动 CrewAI 后端服务 (端口 8000)...
python -m uvicorn main:app --reload --port 8000

pause

