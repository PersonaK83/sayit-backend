# Gateway 완전 중지 및 제거
docker stop sayit-gateway-m2
docker rm sayit-gateway-m2

# 워커 1을 포트 3000으로 직접 연결
docker run -d \
  --name sayit-direct-backend \
  -p 3000:3000 \
  --network sayit-backend_sayit-network \
  -e REDIS_HOST=sayit-redis-m2 \
  -e WORKER_ID=direct-worker \
  -e NODE_ENV=production \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/temp:/app/temp \
  sayit-backend-whisper-worker-1:latest

echo "🚀 워커를 직접 포트 3000에 연결 완료!"

# 10초 대기 후 상태 확인
sleep 10
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"