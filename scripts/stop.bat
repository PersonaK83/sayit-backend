@echo off
chcp 65001 >nul
cls

echo ========================================
echo    🛑 SayIt 백엔드 Docker 중지 (큐 시스템)
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

echo 🔧 Docker 컨테이너 중지 중...
echo    - SayIt 백엔드 서버
echo    - Redis 큐 시스템
echo.

docker-compose down

if errorlevel 1 (
    echo.
    echo ❌ Docker 컨테이너 중지에 실패했습니다!
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ SayIt 백엔드 서버와 큐 시스템이 성공적으로 중지되었습니다!
echo.
echo 📊 현재 실행 중인 컨테이너:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo 🧹 정리 옵션:
echo.
echo 1. 일반 중지 (데이터 보존)
echo 2. 완전 정리 (볼륨 및 이미지 삭제)
echo.
set /p cleanup="정리 옵션을 선택하세요 (1-2): "

if "%cleanup%"=="2" (
    echo.
    echo 🧹 완전 정리 중...
    docker-compose down -v --rmi all
    docker system prune -f
    echo ✅ 완전 정리가 완료되었습니다.
) else (
    echo.
    echo 📦 데이터가 보존되었습니다.
)

echo.
echo 💡 서버를 다시 시작하려면: scripts\start.bat
echo 💡 큐 상태 확인: scripts\queue-status.bat
echo.
pause 