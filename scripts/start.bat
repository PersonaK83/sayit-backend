@echo off
chcp 65001 >nul
cls

echo ========================================
echo    🐳 SayIt 백엔드 Docker 시작 (큐 시스템)
echo ========================================
echo.

REM .env 파일 존재 확인
if not exist ".env" (
    echo ❌ .env 파일이 없습니다!
    echo.
    echo 먼저 초기 설정을 실행해주세요: scripts\setup.bat
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
echo    - SayIt 백엔드 서버
echo    - Redis 큐 시스템
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
echo 🔍 서비스 상태 확인 중...

REM 백엔드 서버 상태 확인
timeout /t 5 /nobreak >nul
curl -s http://localhost:3000/api/health >nul 2>&1
if errorlevel 1 (
    echo ⚠️  백엔드 서버가 아직 시작되지 않았습니다. 잠시 후 다시 확인해주세요.
) else (
    echo ✅ 백엔드 서버가 정상 작동 중입니다.
)

echo.
echo 🎯 큐 시스템 기능:
echo   - 30분 이하 파일 자동 처리
echo   - 2분 청크로 분할 처리
echo   - 최대 5개 청크 병렬 처리
echo   - 실시간 진행률 추적
echo.
echo 💡 유용한 명령어:
echo   - 큐 상태 확인: scripts\queue-status.bat
echo   - 로그 확인: scripts\logs.bat
echo   - 서버 중지: scripts\stop.bat
echo   - 서버 재시작: scripts\restart.bat
echo.
pause 