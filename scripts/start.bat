@echo off
chcp 65001 >nul
cls

echo ========================================
echo    🐳 SayIt 백엔드 Docker 시작
echo ========================================
echo.

REM .env 파일 존재 확인
if not exist ".env" (
    echo ❌ .env 파일이 없습니다!
    echo.
    echo 다음 내용으로 .env 파일을 생성해주세요:
    echo.
    echo OPENAI_API_KEY=your_openai_api_key_here
    echo PORT=3000
    echo NODE_ENV=production
    echo ALLOWED_ORIGINS=*
    echo.
    pause
    exit /b 1
)

REM Docker 실행 여부 확인
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker가 설치되어 있지 않거나 실행되지 않습니다!
    echo Docker Desktop을 설치하고 실행해주세요.
    echo.
    pause
    exit /b 1
)

echo 🔧 Docker Compose로 컨테이너 빌드 및 시작 중...
echo.

docker-compose up --build -d

if errorlevel 1 (
    echo.
    echo ❌ Docker 컨테이너 시작에 실패했습니다!
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ SayIt 백엔드 서버가 성공적으로 시작되었습니다!
echo.
echo 🌐 로컬 접근: http://localhost:3000
echo 📱 외부 접근: http://[공인IP]:3000
echo.
echo 📊 컨테이너 상태:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo 💡 유용한 명령어:
echo   - 로그 확인: scripts\logs.bat
echo   - 서버 중지: scripts\stop.bat
echo   - 서버 재시작: scripts\restart.bat
echo.
pause 