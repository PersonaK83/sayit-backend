#!/bin/bash
# scripts/fix-dependencies.sh

echo "🔧 의존성 문제 해결 중..."

# 1. 기존 lock 파일 삭제
echo "🗑️ 기존 package-lock.json 삭제..."
rm -f package-lock.json

# 2. node_modules 삭제 (깨끗한 설치)
echo "🧹 node_modules 정리..."
rm -rf node_modules

# 3. 새로운 의존성 설치
echo "📦 의존성 재설치 중..."
npm install

# 4. 필요한 디렉토리 생성
echo "📁 디렉토리 생성 중..."
mkdir -p gateway middleware uploads temp logs

# 5. Gateway 서버가 없다면 생성
if [ ! -f gateway/server.js ]; then
    echo "🌐 Gateway 서버 생성 중..."
    # Gateway 서버 코드 (위에서 생성한 내용)
fi

echo "✅ 의존성 문제 해결 완료!"
echo "🚀 이제 ./scripts/start-m2.sh를 다시 실행해보세요." 