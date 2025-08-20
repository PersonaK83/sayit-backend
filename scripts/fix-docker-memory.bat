@echo off
chcp 65001 >nul
cls

echo ========================================
echo    🔧 Docker Desktop 메모리 설정 (수정 버전)
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
    copy "%DOCKER_SETTINGS%" "%DOCKER_SETTINGS%.backup" >nul 2>&1
    
    REM 임시 PowerShell 스크립트 생성
    echo $settingsPath = "%DOCKER_SETTINGS%" > "%TEMP%\docker-update.ps1"
    echo $json = Get-Content $settingsPath ^| ConvertFrom-Json >> "%TEMP%\docker-update.ps1"
    echo $json.memoryMiB = 6144 >> "%TEMP%\docker-update.ps1"
    echo $json.cpus = 4 >> "%TEMP%\docker-update.ps1"
    echo $json.swapMiB = 2048 >> "%TEMP%\docker-update.ps1"
    echo $json ^| ConvertTo-Json -Depth 10 ^| Out-File $settingsPath -Encoding UTF8 >> "%TEMP%\docker-update.ps1"
    echo Write-Host "메모리 설정 업데이트 완료 (6GB)" >> "%TEMP%\docker-update.ps1"
    
    REM PowerShell 스크립트 실행
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\docker-update.ps1"
    
    REM 임시 파일 삭제
    del "%TEMP%\docker-update.ps1" >nul 2>&1
    
    if errorlevel 1 (
        echo ❌ 설정 수정 실패
        pause
        exit /b 1
    ) else (
        echo ✅ 메모리 설정 업데이트 완료 (6GB)
    )
) else (
    echo ❌ Docker 설정 파일을 찾을 수 없습니다.
    echo 💡 Docker Desktop이 올바르게 설치되어 있는지 확인해주세요.
    pause
    exit /b 1
)

echo.
echo 🚀 Docker Desktop 재시작 중...

REM Docker Desktop 시작
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    echo 📍 Docker Desktop 시작 중...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
) else if exist "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe" (
    echo 📍 Docker Desktop 시작 중...
    start "" "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"
) else (
    echo ❌ Docker Desktop 실행 파일을 찾을 수 없습니다.
    pause
    exit /b 1
)

echo.
echo ⏳ Docker Desktop 초기화 대기 중...
echo    💡 "Something went wrong" 메시지가 나타나면 "Restart" 클릭하세요.

REM Docker 시작 대기
set /a counter=0
:WAIT_DOCKER
timeout /t 10 /nobreak >nul
docker version >nul 2>&1
if errorlevel 1 (
    set /a counter+=1
    if %counter% lss 12 (
        echo 🔄 Docker 시작 대기 중... (%counter%/12)
        goto WAIT_DOCKER
    ) else (
        echo.
        echo ⚠️ Docker 시작에 시간이 오래 걸리고 있습니다.
        echo.
        echo 💡 수동 확인:
        echo    1. Docker Desktop 상태 확인
        echo    2. "Something went wrong" 메시지가 있다면 "Restart" 클릭
        echo    3. Settings ^> Resources에서 메모리 6GB 확인
        echo.
        set /p continue="Docker가 시작되었으면 Y를 입력하세요 (Y/N): "
        if /i "%continue%"=="Y" goto DOCKER_READY
        if /i "%continue%"=="y" goto DOCKER_READY
        goto WAIT_DOCKER
    )
)

:DOCKER_READY
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
echo    1. Docker Desktop Settings ^> Resources에서 메모리 6GB 확인
echo    2. scripts\start.bat 으로 서버 시작
echo.
pause 