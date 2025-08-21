 #!/bin/bash
# scripts/start-m2.sh

echo "========================================="
echo "   🚀 SayIt M2 분산처리 시스템 시작"
echo "========================================="
echo

# Docker 상태 확인
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker가 실행되지 않았습니다. Docker Desktop을 시작해주세요."
    exit 1
fi

echo "🔧 이전 컨테이너 정리 중..."
docker-compose -f docker-compose-m2-distributed.yml down

echo "🏗️ M2 최적화 이미지 빌드 중..."
docker-compose -f docker-compose-m2-distributed.yml build --no-cache

echo "🚀 분산처리 시스템 시작 중..."
docker-compose -f docker-compose-m2-distributed.yml up -d

echo "⏳ 시스템 초기화 대기 중..."
sleep 10

echo "📊 컨테이너 상태 확인..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo
echo "✅ M2 분산처리 시스템이 시작되었습니다!"
echo "📍 API 엔드포인트: http://localhost:3000"
echo "📊 모니터링: http://localhost:9100"
echo
echo "🔍 상태 확인: ./scripts/status-m2.sh"
echo "📋 로그 확인: ./scripts/logs-m2.sh"