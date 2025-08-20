@echo off
chcp 65001 >nul
cls

echo ========================================
echo    📊 SayIt 큐 시스템 상태 확인
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

REM 컨테이너 상태 확인
echo 📊 컨테이너 상태:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" --filter "name=sayit"
echo.

REM Redis 연결 확인
echo 🔍 Redis 연결 상태 확인...
docker exec sayit-redis redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo ❌ Redis 서버에 연결할 수 없습니다.
    echo.
) else (
    echo ✅ Redis 서버가 정상 작동 중입니다.
    
    echo.
    echo 📈 Redis 메모리 사용량:
    docker exec sayit-redis redis-cli info memory | findstr "used_memory_human"
)

echo.
echo 🌐 백엔드 서버 상태 확인...

REM 백엔드 헬스 체크
curl -s http://localhost:3000/api/health >nul 2>&1
if errorlevel 1 (
    echo ❌ 백엔드 서버에 연결할 수 없습니다.
) else (
    echo ✅ 백엔드 서버가 정상 작동 중입니다.
    
    echo.
    echo 📋 활성 작업 확인...
    curl -s http://localhost:3000/api/transcribe/jobs 2>nul
)

echo.
echo 🔧 진단 정보 확인...
curl -s http://localhost:3000/api/diagnose 2>nul

echo.
echo.
echo 💡 유용한 테스트 명령어:
echo   - 헬스 체크: curl http://localhost:3000/api/health
echo   - 진단 정보: curl http://localhost:3000/api/diagnose  
echo   - 활성 작업: curl http://localhost:3000/api/transcribe/jobs
echo.
echo 📋 로그 확인: scripts\logs.bat
echo.
pause