@echo off
chcp 65001 >nul
cls

echo ========================================
echo    ⚙️  SayIt 백엔드 초기 설정
echo ========================================
echo.

echo 🔍 시스템 환경 확인 중...
echo.

REM Docker 설치 확인
echo [1/4] Docker 설치 확인...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker가 설치되어 있지 않습니다!
    echo.
    echo 👉 Docker Desktop for Windows를 다운로드하고 설치해주세요:
    echo    https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
) else (
    echo ✅ Docker가 설치되어 있습니다.
)

REM Docker Compose 확인
echo [2/4] Docker Compose 확인...
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Compose가 설치되어 있지 않습니다!
    echo    (보통 Docker Desktop에 포함되어 있습니다)
    echo.
    pause
    exit /b 1
) else (
    echo ✅ Docker Compose가 설치되어 있습니다.
)

REM .env 파일 확인 및 생성
echo [3/4] 환경 변수 파일 (.env) 확인...
if not exist ".env" (
    echo ⚠️  .env 파일이 없습니다. 생성합니다...
    echo.
    
    set /p "openai_key=OpenAI API 키를 입력하세요 (없으면 Enter): "
    
    echo # SayIt 백엔드 환경 변수 > .env
    if "%openai_key%"=="" (
        echo OPENAI_API_KEY=your_openai_api_key_here >> .env
        echo 💡 나중에 .env 파일에서 OPENAI_API_KEY를 실제 키로 변경해주세요.
    ) else (
        echo OPENAI_API_KEY=%openai_key% >> .env
        echo ✅ OpenAI API 키가 설정되었습니다.
    )
    
    echo PORT=3000 >> .env
    echo NODE_ENV=production >> .env
    echo ALLOWED_ORIGINS=* >> .env
    
    echo.
    echo ✅ .env 파일이 생성되었습니다.
) else (
    echo ✅ .env 파일이 이미 존재합니다.
)

REM Windows 방화벽 설정 확인
echo [4/4] Windows 방화벽 설정...
echo.
echo 🛡️  Windows 방화벽에 포트 3000 허용 규칙을 추가합니다.
echo    (관리자 권한이 필요할 수 있습니다)

netsh advfirewall firewall delete rule name="SayIt Backend Docker" >nul 2>&1
netsh advfirewall firewall add rule name="SayIt Backend Docker" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

if errorlevel 1 (
    echo ⚠️  방화벽 설정에 실패했습니다. 수동으로 설정해주세요:
    echo    - Windows Defender 방화벽 열기
    echo    - 인바운드 규칙 추가
    echo    - 포트 3000 TCP 허용
) else (
    echo ✅ Windows 방화벽 설정이 완료되었습니다.
)

echo.
echo ========================================
echo    🎉 초기 설정 완료!
echo ========================================
echo.
echo 🚀 이제 다음 단계를 진행하세요:
echo.
echo    1. 서버 시작: scripts\start.bat
echo    2. 로그 확인: scripts\logs.bat
echo    3. 서버 중지: scripts\stop.bat
echo.
echo 🌐 서버 접속 주소:
echo    - 로컬: http://localhost:3000
echo    - 외부: http://[공인IP]:3000
echo.
echo 🔧 라우터 포트 포워딩 설정:
echo    - 라우터 관리 페이지 접속 (보통 192.168.1.1)
echo    - 포트 포워딩: 외부 포트 3000 → 내부 포트 3000
echo    - 내부 IP: 이 PC의 IP 주소
echo.

REM PC IP 주소 표시
echo 💻 이 PC의 IP 주소:
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%j in ("%%i") do echo    %%j
)

echo.
pause 