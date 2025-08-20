@echo off
chcp 65001 >nul
cls

echo ========================================
echo    📋 SayIt 백엔드 Docker 로그 (큐 시스템)
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
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=sayit"
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

echo 🔍 로그 확인 옵션을 선택하세요:
echo.
echo 1. 백엔드 서버 로그만 보기
echo 2. Redis 큐 시스템 로그만 보기  
echo 3. 모든 서비스 로그 보기
echo 4. 최근 로그만 보기 (마지막 50줄)
echo.
set /p choice="선택하세요 (1-4): "

if "%choice%"=="1" (
    echo.
    echo 📋 백엔드 서버 실시간 로그... (Ctrl+C로 종료)
    echo.
    docker-compose logs -f sayit-backend
) else if "%choice%"=="2" (
    echo.
    echo 📋 Redis 시스템 실시간 로그... (Ctrl+C로 종료)
    echo.
    docker-compose logs -f redis
) else if "%choice%"=="3" (
    echo.
    echo 📋 모든 서비스 실시간 로그... (Ctrl+C로 종료)
    echo.
    docker-compose logs -f
) else if "%choice%"=="4" (
    echo.
    echo 📋 최근 로그 (마지막 50줄):
    echo.
    docker-compose logs --tail=50
    echo.
    pause
) else (
    echo.
    echo 📋 기본: 백엔드 서버 실시간 로그... (Ctrl+C로 종료)
    echo.
    docker-compose logs -f sayit-backend
) 