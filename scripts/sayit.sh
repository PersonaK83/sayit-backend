#!/bin/bash
# scripts/sayit.sh - SayIt M2 통합 관리 스크립트

COMPOSE_FILE="docker-compose-m2-distributed.yml"

show_menu() {
    echo "========================================="
    echo "   🍎 SayIt M2 분산처리 관리자"
    echo "========================================="
    echo "1. 🚀 시스템 시작"
    echo "2. 🛑 시스템 중지"
    echo "3. 🔄 재시작"
    echo "4. 📊 상태 확인"
    echo "5. 📋 로그 확인"
    echo "6. 🔧 Gateway 수정"
    echo "7. 🧪 연결 테스트"
    echo "0. 종료"
    echo "========================================="
}

start_system() {
    echo "🚀 SayIt M2 분산처리 시스템 시작 중..."
    
    # Docker 확인
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker가 실행되지 않았습니다."
        return 1
    fi
    
    # 기존 컨테이너 정리
    echo "🧹 기존 컨테이너 정리 중..."
    docker stop sayit-direct-backend 2>/dev/null
    docker rm sayit-direct-backend 2>/dev/null
    docker-compose -f $COMPOSE_FILE down 2>/dev/null
    
    # 분산처리 시스템 시작
    echo "🏗️ 분산처리 시스템 시작 중..."
    docker-compose -f $COMPOSE_FILE up -d
    
    # 대기
    echo "⏳ 시스템 초기화 대기 중..."
    sleep 20
    
    # Gateway 상태 확인
    if docker ps --format "{{.Names}}" | grep -q "sayit-gateway-m2"; then
        if docker ps | grep "sayit-gateway-m2" | grep -q "Restarting"; then
            echo "⚠️ Gateway가 재시작 중입니다. 워커를 직접 연결합니다..."
            fix_gateway_direct
        else
            echo "✅ Gateway 정상 작동 중!"
        fi
    else
        echo "❌ Gateway 시작 실패. 워커를 직접 연결합니다..."
        fix_gateway_direct
    fi
    
    show_final_status
}

fix_gateway_direct() {
    echo "🔧 워커 직접 연결 모드로 전환 중..."
    
    # Gateway 중지
    docker stop sayit-gateway-m2 2>/dev/null
    docker rm sayit-gateway-m2 2>/dev/null
    
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
    
    sleep 10
    echo "✅ 워커 직접 연결 완료!"
}

stop_system() {
    echo "🛑 시스템 중지 중..."
    
    # 직접 연결된 백엔드 중지
    docker stop sayit-direct-backend 2>/dev/null
    docker rm sayit-direct-backend 2>/dev/null
    
    # 분산처리 시스템 중지
    docker-compose -f $COMPOSE_FILE down
    
    echo "✅ 시스템 중지 완료!"
}

show_status() {
    echo "📊 시스템 상태:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo
    
    # Redis 상태
    if docker ps --format "{{.Names}}" | grep -q "redis"; then
        redis_container=$(docker ps --format "{{.Names}}" | grep redis | head -1)
        echo "🔗 Redis 상태:"
        docker exec $redis_container redis-cli ping 2>/dev/null && echo "✅ Redis 연결됨" || echo "❌ Redis 연결 실패"
        
        echo "📊 큐 상태:"
        docker exec $redis_container redis-cli info | grep -E "connected_clients|used_memory_human"
    fi
    echo
    
    # API 상태
    echo "🌐 API 상태:"
    response=$(curl -s --connect-timeout 5 http://localhost:3000/api/health)
    if [ $? -eq 0 ]; then
        echo "✅ API 연결됨: $response"
    else
        echo "❌ API 연결 실패"
    fi
    
    # 외부 접근 정보
    local_ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    echo
    echo "📍 접속 정보:"
    echo "   로컬: http://localhost:3000"
    echo "   네트워크: http://$local_ip:3000"
    echo "   모니터링: http://$local_ip:9100"
}

show_final_status() {
    echo
    echo "========================================="
    echo "   ✅ SayIt M2 시스템 시작 완료!"
    echo "========================================="
    show_status
}

show_logs() {
    echo "📋 로그 옵션:"
    echo "1. 전체 로그"
    echo "2. 백엔드 로그"
    echo "3. 워커 로그"
    echo "4. Redis 로그"
    read -p "선택하세요 (1-4): " log_choice
    
    case $log_choice in
        1)
            docker-compose -f $COMPOSE_FILE logs -f
            ;;
        2)
            if docker ps --format "{{.Names}}" | grep -q "sayit-direct-backend"; then
                docker logs -f sayit-direct-backend
            else
                docker logs -f sayit-gateway-m2
            fi
            ;;
        3)
            echo "워커 선택: 1, 2, 3"
            read -p "워커 번호: " worker_num
            docker logs -f sayit-worker-${worker_num}-m2
            ;;
        4)
            docker logs -f sayit-redis-m2
            ;;
        *)
            echo "❌ 잘못된 선택입니다."
            ;;
    esac
}

test_connection() {
    echo "🧪 연결 테스트 시작..."
    
    # 로컬 연결
    echo "📍 로컬 연결 테스트:"
    curl -s http://localhost:3000/api/health && echo " ✅" || echo " ❌"
    
    # 외부 연결
    local_ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    echo "🌐 외부 연결 테스트 ($local_ip):"
    curl -s http://$local_ip:3000/api/health && echo " ✅" || echo " ❌"
    
    # 진단 API
    echo "🔍 시스템 진단:"
    curl -s http://localhost:3000/api/diagnose | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/api/diagnose
}

# 메인 루프
while true; do
    show_menu
    read -p "선택하세요 (0-7): " choice
    
    case $choice in
        1) start_system ;;
        2) stop_system ;;
        3) stop_system && sleep 3 && start_system ;;
        4) show_status ;;
        5) show_logs ;;
        6) fix_gateway_direct ;;
        7) test_connection ;;
        0) echo "👋 관리자를 종료합니다."; exit 0 ;;
        *) echo "❌ 잘못된 선택입니다." ;;
    esac
    
    echo
    read -p "계속하려면 Enter를 누르세요..."
done