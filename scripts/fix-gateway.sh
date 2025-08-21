#!/bin/bash
# scripts/fix-gateway.sh

echo "🔧 Gateway 문제 해결 시작..."

cd /Users/hyemoonjung/backend_server/nodejs/backend_sayit

# 1. Gateway 디렉토리 생성
echo "📁 Gateway 디렉토리 생성 중..."
mkdir -p gateway

# 2. Gateway 서버 파일 생성 (위의 코드)
echo "📝 Gateway 서버 파일 생성 중..."
# (위의 gateway/server.js 내용을 여기에 삽입)

# 3. axios 의존성 추가
echo "📦 의존성 설치 중..."
npm install axios

# 4. Gateway 재빌드
echo "🔨 Gateway 재빌드 중..."
docker stop sayit-gateway-m2 2>/dev/null
docker rm sayit-gateway-m2 2>/dev/null
docker-compose -f docker-compose-m2-distributed.yml build api-gateway

# 5. Gateway 재시작
echo "🚀 Gateway 재시작 중..."
docker-compose -f docker-compose-m2-distributed.yml up -d api-gateway

# 6. 상태 확인
echo "⏳ 시작 대기 중..."
sleep 30

echo "✅ Gateway 수정 완료!"
echo "📊 최종 상태:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "🧪 연결 테스트:"
curl -s http://localhost:3000/api/health
EOF

chmod +x scripts/fix-gateway.sh