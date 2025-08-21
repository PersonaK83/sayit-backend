 #!/bin/bash
# scripts/manage-direct.sh

show_menu() {
    echo "========================================="
    echo "   🍎 SayIt M2 직접 연결 관리자"
    echo "========================================="
    echo "1. 🚀 백엔드 시작 (직접 연결)"
    echo "2. 🛑 백엔드 중지"
    echo "3. 🔄 백엔드 재시작"
    echo "4. 📊 상태 확인"
    echo "5. 📋 로그 확인"
    echo "6. 🧪 연결 테스트"
    echo "7. 🔧 Gateway 복구 시도"
    echo "0. 종료"
    echo "========================================="
}

start_direct_backend() {
    echo "🚀 직접 연결 백엔드 시작 중..."
    
    # 기존 컨테이너 정리
    docker stop sayit-direct-backend sayit-gateway-m2 2>/dev/null
    docker rm sayit-direct-backend sayit-gateway-m2 2>/dev/null
    
    # 워커를 직접 포트 3000에 연결
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
    
    echo "✅ 직접 연결 백엔드 시작 완료!"
}

while true; do
    show_menu
    read -p "선택하세요 (0-7): " choice
    
    case $choice in
        1)
            start_direct_backend
            ;;
        2)
            echo "🛑 백엔드 중지 중..."
            docker stop sayit-direct-backend
            ;;
        3)
            echo "🔄 백엔드 재시작 중..."
            docker restart sayit-direct-backend
            ;;
        4)
            ./scripts/status-direct.sh
            ;;
        5)
            echo "📋 백엔드 로그:"
            docker logs sayit-direct-backend --tail 20
            ;;
        6)
            echo "🧪 연결 테스트:"
            curl -s http://localhost:3000/api/health
            ;;
        7)
            echo "🔧 Gateway 복구 시도..."
            docker-compose -f docker-compose-m2-distributed.yml up -d api-gateway
            ;;
        0)
            echo "👋 관리자를 종료합니다."
            exit 0
            ;;
        *)
            echo "❌ 잘못된 선택입니다."
            ;;
    esac
    
    echo
    read -p "계속하려면 Enter를 누르세요..."
done

chmod +x scripts/manage-direct.sh
EOF