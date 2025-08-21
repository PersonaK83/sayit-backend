 #!/bin/bash
# scripts/monitor-m2.sh

echo "========================================="
echo "   📈 SayIt M2 실시간 모니터링"
echo "========================================="
echo

echo "🔄 실시간 모니터링을 시작합니다..."
echo "⏹️ 중지하려면 Ctrl+C를 누르세요"
echo

while true; do
    clear
    echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================="
    
    # 컨테이너 상태
    echo "🐳 컨테이너 상태:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.CPU %}}\t{{.MemUsage}}" | head -5
    echo
    
    # Redis 큐 상태
    echo "📊 큐 상태:"
    docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory_human|keyspace"
    echo
    
    # 시스템 리소스
    echo "💻 시스템 리소스:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -5
    echo
    
    sleep 5
done