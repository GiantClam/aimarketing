# 启动 CrewAI 后端服务
# 使用方法: .\scripts\start-backend.ps1

$backendDir = Join-Path $PSScriptRoot "..\submodules\saleagent\apps\agent"

if (-not (Test-Path $backendDir)) {
    Write-Host "错误: 找不到后端目录: $backendDir" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $backendDir "main.py"))) {
    Write-Host "错误: 找不到 main.py 文件" -ForegroundColor Red
    exit 1
}

Write-Host "切换到后端目录: $backendDir" -ForegroundColor Green
Set-Location $backendDir

Write-Host "启动 CrewAI 后端服务 (端口 8000)..." -ForegroundColor Green
python -m uvicorn main:app --reload --port 8000

