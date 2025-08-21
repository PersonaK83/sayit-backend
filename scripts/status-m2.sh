#!/bin/bash
# scripts/status-m2.sh - 수정 버전

echo "========================================="
echo "   📊 SayIt M2 시스템 상태"
echo "========================================="
echo

echo "🐳 컨테이너 상태:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo

echo "📊 리소스 사용량:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
echo

# Redis 연결 상태 (컨테이너 존재 확인 후)
if docker ps --format "{{.Names}}" | grep -q "sayit-redis-m2"; then
    echo "🔗 Redis 연결 상태:"
    docker exec sayit-redis-m2 redis-cli ping
    echo
    
    echo "📈 큐 상태:"
    docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory_human"
    echo
else
    echo "❌ Redis 컨테이너가 실행 중이지 않습니다."
    echo
fi

# API 상태 (컨테이너 존재 확인 후)
if docker ps --format "{{.Names}}" | grep -q "sayit-gateway-m2"; then
    echo "🌐 API 상태:"
    curl -s --connect-timeout 5 http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || curl -s --connect-timeout 5 http://localhost:3000/api/health
else
    echo "❌ API Gateway 컨테이너가 실행 중이지 않습니다."
fi 