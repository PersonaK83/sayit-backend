@echo off
chcp 65001 >nul
cls

echo ========================================
echo    🔄 SayIt 백엔드 Docker 재시작
echo ========================================
echo.

REM Docker 실행 여부 확인
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker가 설치되어 있지 않거나 실행되지 않습니다!
    echo Docker Desktop을 설치하고 실행해주세요.
    echo.
    pause
    exit /b 1
)

echo 🔧 Docker 컨테이너 재시작 중...
echo.

docker-compose restart sayit-backend

if errorlevel 1 (
    echo.
    echo ❌ Docker 컨테이너 재시작에 실패했습니다!
    echo 전체 재빌드를 시도합니다...
    echo.
    
    docker-compose down
    docker-compose up --build -d
    
    if errorlevel 1 (
        echo ❌ 전체 재빌드도 실패했습니다!
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ✅ SayIt 백엔드 서버가 성공적으로 재시작되었습니다!
echo.
echo 🌐 로컬 접근: http://localhost:3000
echo 📱 외부 접근: http://[공인IP]:3000
echo.
echo 📊 컨테이너 상태:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo 💡 로그 확인: scripts\logs.bat
echo.
pause 