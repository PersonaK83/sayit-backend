@echo off
chcp 65001 >nul
cls

echo ========================================
echo    🐳 Docker Desktop 메모리 설정 업데이트
echo ========================================
echo.

echo 🔧 Docker Desktop 중지 중...
taskkill /f /im "Docker Desktop.exe" >nul 2>&1
taskkill /f /im "com.docker.backend.exe" >nul 2>&1
taskkill /f /im "com.docker.cli.exe" >nul 2>&1

echo ⏳ Docker 완전 종료 대기 (5초)...
timeout /t 5 /nobreak >nul

echo 📝 설정 파일 확인 및 백업 중...
set "DOCKER_SETTINGS=%APPDATA%\Docker\settings.json"

if exist "%DOCKER_SETTINGS%" (
    copy "%DOCKER_SETTINGS%" "%DOCKER_SETTINGS%.backup" >nul
    echo ✅ 설정 파일 백업 완료
) else (
    echo ❌ Docker 설정 파일을 찾을 수 없습니다.
    echo 💡 Docker Desktop이 설치되어 있는지 확인해주세요.
    pause
    exit /b 1
)

echo 🔧 메모리 설정 업데이트 중...

REM PowerShell로 JSON 설정 수정
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
    try {
        $settingsPath = '%DOCKER_SETTINGS%'
        Write-Host '📄 설정 파일 읽는 중...'
        
        if (Test-Path $settingsPath) {
            $settings = Get-Content $settingsPath | ConvertFrom-Json
            
            Write-Host '🔧 메모리 설정 업데이트 중...'
            $settings.memoryMiB = 6144      # 6GB
            $settings.cpus = 4              # 4 CPU cores
            $settings.swapMiB = 2048        # 2GB Swap
            
            Write-Host '💾 설정 파일 저장 중...'
            $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8
            
            Write-Host '✅ 메모리 설정 업데이트 완료!'
            Write-Host '   - 메모리: 6GB'
            Write-Host '   - CPU: 4코어'
            Write-Host '   - Swap: 2GB'
        } else {
            Write-Host '❌ 설정 파일을 찾을 수 없습니다.'
            exit 1
        }
    } catch {
        Write-Host '❌ 설정 업데이트 실패: ' $_.Exception.Message
        exit 1
    }
}"

if errorlevel 1 (
    echo ❌ PowerShell 설정 업데이트에 실패했습니다.
    pause
    exit /b 1
)

echo.
echo 🚀 Docker Desktop 재시작 중...

REM Docker Desktop 실행 경로 확인
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo ✅ Docker Desktop 시작됨
) else if exist "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe" (
    start "" "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"
    echo ✅ Docker Desktop 시작됨
) else (
    echo ❌ Docker Desktop 실행 파일을 찾을 수 없습니다.
    echo 💡 수동으로 Docker Desktop을 시작해주세요.
    pause
    exit /b 1
)

echo.
echo ⏳ Docker Desktop 초기화 대기 중...
echo    (Docker가 완전히 시작될 때까지 30-60초 소요)

REM Docker 서비스 시작 대기
:WAIT_DOCKER
timeout /t 10 /nobreak >nul
docker version >nul 2>&1
if errorlevel 1 (
    echo 🔄 Docker 시작 대기 중...
    goto WAIT_DOCKER
)

echo ✅ Docker가 성공적으로 시작되었습니다!

echo.
echo 📊 현재 Docker 시스템 정보:
docker system info | findstr /C:"Total Memory" /C:"CPUs"

echo.
echo ========================================
echo    🎉 Docker 메모리 설정 완료!
echo ========================================
echo.
echo 📋 다음 단계:
echo    1. Docker Desktop이 완전히 로드될 때까지 잠시 기다리세요
echo    2. scripts\start.bat 으로 서버를 시작하세요
echo.
pause 