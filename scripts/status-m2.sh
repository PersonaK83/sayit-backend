#!/bin/bash
# scripts/status-m2.sh

echo "========================================="
echo "   📊 SayIt M2 시스템 상태"
echo "========================================="
echo

echo "🐳 컨테이너 상태:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.CPU %}}\t{{.MemUsage}}"
echo

echo "📊 리소스 사용량:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
echo

echo "🔗 Redis 연결 상태:"
docker exec sayit-redis-m2 redis-cli ping
echo

echo "📈 큐 상태:"
docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory_human"
echo

echo "🌐 API 상태:"
curl -s http://localhost:3000/api/health | jq '.' 2>/dev/null || curl -s http://localhost:3000/api/health 