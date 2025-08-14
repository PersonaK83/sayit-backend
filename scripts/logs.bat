@echo off
chcp 65001 >nul
cls

echo ========================================
echo    📋 SayIt 백엔드 Docker 로그
echo ========================================
echo.

REM Docker 실행 여부 확인
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker가 설치되어 있지 않거나 실행되지 않습니다!
    echo.
    pause
    exit /b 1
)

echo 📊 컨테이너 상태:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.

REM 컨테이너가 실행 중인지 확인
docker ps -q --filter "name=sayit-backend" | findstr . >nul
if errorlevel 1 (
    echo ⚠️  sayit-backend 컨테이너가 실행되지 않습니다.
    echo.
    echo 서버를 시작하려면: scripts\start.bat
    echo.
    pause
    exit /b 1
)

echo 📋 실시간 로그 확인 중... (Ctrl+C로 종료)
echo.

docker-compose logs -f sayit-backend 