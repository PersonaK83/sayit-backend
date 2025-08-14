@echo off
chcp 65001 >nul
cls

echo ========================================
echo    🛑 SayIt 백엔드 Docker 중지
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
echo ✅ SayIt 백엔드 서버가 성공적으로 중지되었습니다!
echo.
echo 📊 현재 실행 중인 컨테이너:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo 💡 서버를 다시 시작하려면: scripts\start.bat
echo.
pause 