#!/bin/bash
# scripts/logs-m2.sh

echo "========================================="
echo "   📋 SayIt M2 시스템 로그"
echo "========================================="
echo

if [ "$1" = "gateway" ]; then
    echo "🌐 API Gateway 로그:"
    docker logs -f sayit-gateway-m2
elif [ "$1" = "worker1" ]; then
    echo "⚡ Worker 1 로그:"
    docker logs -f sayit-worker-1-m2
elif [ "$1" = "worker2" ]; then
    echo "⚡ Worker 2 로그:"
    docker logs -f sayit-worker-2-m2
elif [ "$1" = "worker3" ]; then
    echo "⚡ Worker 3 로그:"
    docker logs -f sayit-worker-3-m2
elif [ "$1" = "redis" ]; then
    echo "🔗 Redis 로그:"
    docker logs -f sayit-redis-m2
else
    echo "📋 전체 시스템 로그:"
    docker-compose -f docker-compose-m2-distributed.yml logs -f
fi 