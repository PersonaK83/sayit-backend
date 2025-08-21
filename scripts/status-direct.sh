 #!/bin/bash
# scripts/status-direct.sh

echo "========================================="
echo "   📊 SayIt M2 직접 연결 상태"
echo "========================================="
echo

echo "🐳 컨테이너 상태:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo

echo "📊 리소스 사용량:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
echo

# Redis 연결 상태
if docker ps --format "{{.Names}}" | grep -q "sayit-redis-m2"; then
    echo "🔗 Redis 연결 상태:"
    docker exec sayit-redis-m2 redis-cli ping
    echo
    
    echo "📈 큐 상태:"
    docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory_human"
    echo
fi

# 백엔드 API 상태
if docker ps --format "{{.Names}}" | grep -q "sayit-direct-backend"; then
    echo "🌐 백엔드 API 상태:"
    curl -s --connect-timeout 5 http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || curl -s --connect-timeout 5 http://localhost:3000/api/health
    echo
fi

# 네트워크 정보
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
echo "📍 접속 정보:"
echo "   로컬: http://localhost:3000"
echo "   네트워크: http://$LOCAL_IP:3000"
echo "   모니터링: http://$LOCAL_IP:9100"
echo "========================================="

chmod +x scripts/status-direct.sh
EOF