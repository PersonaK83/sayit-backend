@echo off
chcp 65001 >nul
cls

echo ========================================
echo    🔧 Docker Desktop 메모리 설정 (안정화 버전)
echo ========================================
echo.

echo 🛑 모든 Docker 프로세스 완전 종료 중...
taskkill /f /im "Docker Desktop.exe" >nul 2>&1
taskkill /f /im "com.docker.backend.exe" >nul 2>&1
taskkill /f /im "com.docker.cli.exe" >nul 2>&1
taskkill /f /im "dockerd.exe" >nul 2>&1

echo 🔧 Docker 서비스 중지 중...
net stop "Docker Desktop Service" >nul 2>&1
sc stop "Docker Desktop Service" >nul 2>&1

echo ⏳ 완전 종료 대기 (10초)...
timeout /t 10 /nobreak >nul

echo 🌐 WSL 재시작 중...
wsl --shutdown >nul 2>&1
timeout /t 5 /nobreak >nul

echo 📝 Docker 설정 파일 수정 중...
set "DOCKER_SETTINGS=%APPDATA%\Docker\settings.json"

if exist "%DOCKER_SETTINGS%" (
    echo ✅ 설정 파일 발견: %DOCKER_SETTINGS%
    
    REM 백업 생성
    copy "%DOCKER_SETTINGS%" "%DOCKER_SETTINGS%.backup.%DATE:/=-%_%TIME::=-%" >nul 2>&1
    
    REM 간단한 PowerShell 명령으로 설정 수정
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$json = Get-Content '%DOCKER_SETTINGS%' | ConvertFrom-Json; ^
     $json.memoryMiB = 6144; ^
     $json.cpus = 4; ^
     $json.swapMiB = 2048; ^
     $json | ConvertTo-Json -Depth 10 | Out-File '%DOCKER_SETTINGS%' -Encoding UTF8; ^
     Write-Host '✅ 메모리 설정 업데이트 완료 (6GB)'"
     
    if errorlevel 1 (
        echo ❌ 설정 수정 실패
        pause
        exit /b 1
    )
) else (
    echo ❌ Docker 설정 파일을 찾을 수 없습니다.
    echo 💡 Docker Desktop이 올바르게 설치되어 있는지 확인해주세요.
    pause
    exit /b 1
)

echo.
echo 🚀 Docker Desktop 안전 모드로 재시작 중...
echo    (이 과정에서 "Something went wrong" 메시지가 나올 수 있습니다)

REM Docker Desktop을 관리자 권한으로 시작
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    echo 📍 Docker Desktop 시작: C:\Program Files\Docker\Docker\
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" --reset-to-factory
    timeout /t 3 /nobreak >nul
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
) else if exist "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe" (
    echo 📍 Docker Desktop 시작: %LOCALAPPDATA%\Programs\Docker\Docker\
    start "" "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"
) else (
    echo ❌ Docker Desktop 실행 파일을 찾을 수 없습니다.
    pause
    exit /b 1
)

echo.
echo ⏳ Docker Desktop 초기화 대기 중...
echo    💡 "Something went wrong" 메시지가 나타나면:
echo       1. "Restart Docker Desktop" 클릭
echo       2. 또는 Docker Desktop을 닫고 다시 열기
echo       3. 설정이 적용될 때까지 2-3분 기다리기

REM 더 긴 대기 시간으로 Docker 시작 확인
set /a counter=0
:WAIT_DOCKER
timeout /t 10 /nobreak >nul
docker version >nul 2>&1
if errorlevel 1 (
    set /a counter+=1
    if %counter% lss 18 (
        echo 🔄 Docker 시작 대기 중... (%counter%/18) - 약 %counter%0초 경과
        goto WAIT_DOCKER
    ) else (
        echo.
        echo ⚠️ Docker 시작에 예상보다 오래 걸리고 있습니다.
        echo.
        echo 💡 수동 확인 방법:
        echo    1. Docker Desktop 아이콘을 클릭하여 상태 확인
        echo    2. "Something went wrong" 메시지가 있다면 "Restart" 클릭
        echo    3. Settings > Resources에서 메모리가 6GB로 설정되었는지 확인
        echo.
        choice /c YN /m "Docker가 정상 작동하면 Y, 계속 기다리려면 N을 누르세요"
        if errorlevel 2 goto WAIT_DOCKER
    )
)

echo.
echo ✅ Docker가 시작되었습니다!

echo.
echo 📊 현재 Docker 설정 확인:
docker system info 2>nul | findstr /C:"Total Memory" /C:"CPUs"

echo.
echo ========================================
echo    🎉 Docker 메모리 설정 완료!
echo ========================================
echo.
echo 📋 다음 단계:
echo    1. Docker Desktop에서 메모리 설정 확인 (Settings > Resources)
echo    2. scripts\start.bat 으로 서버 시작
echo.
echo 💡 문제가 계속되면:
echo    - Docker Desktop을 완전히 닫고 다시 시작
echo    - Windows 재부팅 후 다시 시도
echo.
pause 