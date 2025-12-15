# 启动 CrewAI 后端服务
# 使用方法: .\scripts\start-backend.ps1

$backendDir = Join-Path $PSScriptRoot "..\submodules\saleagent\apps"

if (-not (Test-Path $backendDir)) {
    Write-Host "错误: 找不到后端目录: $backendDir" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $backendDir "agent\main.py"))) {
    Write-Host "错误: 找不到 agent\\main.py 文件" -ForegroundColor Red
    exit 1
}

Write-Host "切换到后端目录: $backendDir" -ForegroundColor Green
Set-Location $backendDir

Write-Host "启动 CrewAI 后端服务 (端口 8000)..." -ForegroundColor Green
$env:PYTHONPATH = $backendDir
python -m uvicorn agent.main:app --reload --host 0.0.0.0 --port 8000 --app-dir "$backendDir"

