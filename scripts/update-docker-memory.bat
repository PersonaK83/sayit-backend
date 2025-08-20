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

REM 임시 PowerShell 스크립트 파일 생성
echo try { > "%TEMP%\update-docker.ps1"
echo     $settingsPath = '%DOCKER_SETTINGS%' >> "%TEMP%\update-docker.ps1"
echo     Write-Host '📄 설정 파일 읽는 중...' >> "%TEMP%\update-docker.ps1"
echo     if (Test-Path $settingsPath) { >> "%TEMP%\update-docker.ps1"
echo         $settings = Get-Content $settingsPath ^| ConvertFrom-Json >> "%TEMP%\update-docker.ps1"
echo         Write-Host '🔧 메모리 설정 업데이트 중...' >> "%TEMP%\update-docker.ps1"
echo         $settings.memoryMiB = 6144 >> "%TEMP%\update-docker.ps1"
echo         $settings.cpus = 4 >> "%TEMP%\update-docker.ps1"
echo         $settings.swapMiB = 2048 >> "%TEMP%\update-docker.ps1"
echo         Write-Host '💾 설정 파일 저장 중...' >> "%TEMP%\update-docker.ps1"
echo         $settings ^| ConvertTo-Json -Depth 10 ^| Set-Content $settingsPath -Encoding UTF8 >> "%TEMP%\update-docker.ps1"
echo         Write-Host '✅ 메모리 설정 업데이트 완료!' >> "%TEMP%\update-docker.ps1"
echo         Write-Host '   - 메모리: 6GB' >> "%TEMP%\update-docker.ps1"
echo         Write-Host '   - CPU: 4코어' >> "%TEMP%\update-docker.ps1"
echo         Write-Host '   - Swap: 2GB' >> "%TEMP%\update-docker.ps1"
echo     } else { >> "%TEMP%\update-docker.ps1"
echo         Write-Host '❌ 설정 파일을 찾을 수 없습니다.' >> "%TEMP%\update-docker.ps1"
echo         exit 1 >> "%TEMP%\update-docker.ps1"
echo     } >> "%TEMP%\update-docker.ps1"
echo } catch { >> "%TEMP%\update-docker.ps1"
echo     Write-Host '❌ 설정 업데이트 실패: ' $_.Exception.Message >> "%TEMP%\update-docker.ps1"
echo     exit 1 >> "%TEMP%\update-docker.ps1"
echo } >> "%TEMP%\update-docker.ps1"

REM PowerShell 스크립트 실행
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\update-docker.ps1"

if errorlevel 1 (
    echo ❌ PowerShell 설정 업데이트에 실패했습니다.
    del "%TEMP%\update-docker.ps1" >nul 2>&1
    pause
    exit /b 1
)

REM 임시 파일 정리
del "%TEMP%\update-docker.ps1" >nul 2>&1

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
set /a counter=0
:WAIT_DOCKER
timeout /t 5 /nobreak >nul
docker version >nul 2>&1
if errorlevel 1 (
    set /a counter+=1
    if %counter% lss 12 (
        echo 🔄 Docker 시작 대기 중... (%counter%/12)
        goto WAIT_DOCKER
    ) else (
        echo ⚠️ Docker 시작에 시간이 오래 걸리고 있습니다.
        echo 💡 수동으로 Docker Desktop 상태를 확인해주세요.
        pause
        exit /b 1
    )
)

echo ✅ Docker가 성공적으로 시작되었습니다!

echo.
echo 📊 현재 Docker 시스템 정보:
docker system info | findstr /C:"Total Memory" /C:"CPUs" 2>nul

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