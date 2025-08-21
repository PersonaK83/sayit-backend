#!/bin/bash
# scripts/setup-m2.sh

echo "========================================="
echo "   🔧 SayIt M2 환경 설정"
echo "========================================="
echo

# 1. 디렉토리 생성
echo "📁 필요한 디렉토리 생성 중..."
mkdir -p uploads temp logs scripts gateway middleware
echo "✅ 디렉토리 생성 완료"

# 2. 환경 변수 파일 확인
if [ ! -f .env ]; then
    echo "📝 환경 변수 파일 생성 중..."
    cp .env.m2 .env
    echo "⚠️ .env 파일의 OPENAI_API_KEY를 실제 키로 변경해주세요!"
else
    echo "✅ .env 파일이 이미 존재합니다."
fi

# 3. 스크립트 실행 권한 부여
echo "🔑 스크립트 실행 권한 설정 중..."
chmod +x scripts/*.sh
echo "✅ 실행 권한 설정 완료"

# 4. Docker 상태 확인
echo "🐳 Docker 상태 확인 중..."
if docker info > /dev/null 2>&1; then
    echo "✅ Docker가 실행 중입니다."
else
    echo "❌ Docker가 실행되지 않았습니다."
    echo "💡 Docker Desktop을 실행해주세요: open -a Docker"
    exit 1
fi

# 5. 의존성 확인
echo "📦 의존성 확인 중..."
if [ -f package.json ]; then
    echo "✅ package.json 파일 존재"
else
    echo "❌ package.json 파일이 없습니다."
    exit 1
fi

echo
echo "========================================="
echo "   ✅ M2 환경 설정 완료!"
echo "========================================="
echo
echo "다음 단계:"
echo "1. .env 파일에서 OPENAI_API_KEY 설정"
echo "2. ./scripts/start-m2.sh 실행"
echo "3. ./scripts/status-m2.sh로 상태 확인"
echo 