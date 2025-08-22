#!/bin/bash
# scripts/sayit.sh - SayIt M2 통합 관리 스크립트

COMPOSE_FILE="docker-compose-m2-distributed.yml"

# Whisper 설치 확인 및 자동 설치 함수 (개선)
check_and_install_whisper() {
    echo "🔍 모든 백엔드 컨테이너 Whisper 설치 상태 확인 중..."
    
    # 실행 중인 모든 백엔드 관련 컨테이너 찾기
    all_backends=$(docker ps --format "{{.Names}}" | grep -E "(worker|backend|direct)" | grep -v gateway)
    
    if [ -z "$all_backends" ]; then
        echo "⚠️ 실행 중인 백엔드 컨테이너가 없습니다."
        return 1
    fi
    
    echo "📋 발견된 백엔드 컨테이너들:"
    echo "$all_backends" | sed 's/^/   - /'
    echo
    
    for container in $all_backends; do
        echo "🔧 [$container] Whisper 확인 및 설치..."
        
        # 컨테이너 상태 확인
        if ! docker exec $container echo "alive" > /dev/null 2>&1; then
            echo "❌ [$container] 컨테이너 접근 불가"
            continue
        fi
        
        # Whisper 설치 확인
        if docker exec $container which whisper > /dev/null 2>&1; then
            echo "✅ [$container] Whisper 이미 설치됨"
            # Whisper 버전 확인
            whisper_version=$(docker exec $container whisper --help 2>/dev/null | head -1 | grep -o "whisper" || echo "설치됨")
            echo "   📦 상태: $whisper_version"
        else
            echo "📦 [$container] Whisper 설치 시작..."
            
            # Python3 확인 및 설치
            if ! docker exec $container which python3 > /dev/null 2>&1; then
                echo "   🐍 Python3 설치 중..."
                docker exec -u root $container bash -c "
                    apt-get update -qq && 
                    apt-get install -y python3-pip python3-venv -qq
                " > /dev/null 2>&1 || {
                    echo "   ❌ Python3 설치 실패"
                    continue
                }
            fi
            
            # Whisper 설치
            echo "   🎙️ OpenAI Whisper 설치 중..."
            docker exec -u root $container bash -c "
                pip3 install openai-whisper --quiet
            " > /dev/null 2>&1 || {
                echo "   ❌ Whisper 설치 실패"
                continue
            }
            
            # 설치 확인
            if docker exec $container which whisper > /dev/null 2>&1; then
                echo "   ✅ Whisper 설치 완료"
            else
                echo "   ❌ Whisper 설치 확인 실패"
            fi
        fi
        
        # Python 경로 확인
        python_path=$(docker exec $container which python3 2>/dev/null || echo "없음")
        echo "   🐍 Python 경로: $python_path"
        echo
    done
    
    echo "🎯 모든 백엔드 컨테이너 Whisper 설치 확인 완료!"
}

# 큐 시스템 상태 확인 및 정리
check_and_clean_queue() {
    echo "🔍 큐 시스템 상태 확인 중..."
    
    # Redis 연결 확인
    if ! docker exec sayit-redis-m2 redis-cli ping > /dev/null 2>&1; then
        echo "❌ Redis 연결 실패"
        return 1
    fi
    
    # 큐 상태 확인
    echo "📊 현재 큐 상태:"
    docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory_human"
    
    # 실패한 작업 확인
    failed_count=$(docker exec sayit-redis-m2 redis-cli keys "*:failed" 2>/dev/null | wc -l)
    
    if [ "$failed_count" -gt 0 ]; then
        echo "🧹 실패한 작업 $failed_count개 발견. 정리하시겠습니까? (y/N)"
        read -p "선택: " clean_choice
        if [[ $clean_choice =~ ^[Yy]$ ]]; then
            docker exec sayit-redis-m2 redis-cli FLUSHDB > /dev/null
            echo "✅ 큐 정리 완료"
        fi
    else
        echo "✅ 큐 상태 정상 (실패한 작업 없음)"
    fi
}

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
    echo "8. 🎙️ Whisper 설치/확인"
    echo "9. 🧹 큐 정리"
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
    
    # Whisper 자동 설치 확인 (시스템 시작 후)
    echo
    echo "🔧 모든 백엔드 컨테이너 Whisper 설치 상태 자동 확인..."
    check_and_install_whisper
    
    # 큐 시스템 정리
    echo
    check_and_clean_queue
    
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
    
    echo "⏳ 직접 백엔드 시작 대기 중..."
    sleep 15
    
    # 직접 연결된 백엔드에 Whisper 설치 확인 (강화)
    echo "🔧 직접 연결된 백엔드 Whisper 확인..."
    if docker exec sayit-direct-backend which whisper > /dev/null 2>&1; then
        echo "✅ 직접 백엔드 Whisper 이미 설치됨"
    else
        echo "📦 직접 백엔드에 Whisper 설치 중..."
        docker exec -u root sayit-direct-backend bash -c "
            echo '🐍 Python3 설치 중...' &&
            apt-get update -qq && 
            apt-get install -y python3-pip python3-venv -qq &&
            echo '🎙️ Whisper 설치 중...' &&
            pip3 install openai-whisper --quiet &&
            echo '✅ 설치 완료'
        " || {
            echo "❌ 직접 백엔드 Whisper 설치 실패"
        }
        
        # 설치 확인
        if docker exec sayit-direct-backend which whisper > /dev/null 2>&1; then
            echo "✅ 직접 백엔드 Whisper 설치 확인 완료"
        else
            echo "❌ 직접 백엔드 Whisper 설치 실패"
        fi
    fi
    
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
    if docker ps --format "{{.Names}}" | grep -q "sayit-redis-m2"; then
        echo "🔗 Redis 상태:"
        docker exec sayit-redis-m2 redis-cli ping 2>/dev/null && echo "✅ Redis 연결됨" || echo "❌ Redis 연결 실패"
        echo "📊 큐 상태:"
        docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory_human"
    fi
    
    # API 상태
    echo
    echo "🌐 API 상태:"
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        api_response=$(curl -s http://localhost:3000/api/health)
        echo "✅ API 연결됨: $api_response"
    else
        echo "❌ API 연결 실패"
    fi
    
    # Whisper 설치 상태 확인
    echo
    echo "🎙️ Whisper 설치 상태:"
    all_backends=$(docker ps --format "{{.Names}}" | grep -E "(worker|backend|direct)")
    for container in $all_backends; do
        if docker exec $container which whisper > /dev/null 2>&1; then
            echo "   ✅ $container: 설치됨"
        else
            echo "   ❌ $container: 미설치"
        fi
    done
    
    # 접속 정보
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
    echo "2. 직접 백엔드 로그"
    echo "3. 워커 로그"
    echo "4. Redis 로그"
    echo "5. Gateway 로그"
    read -p "선택하세요 (1-5): " log_choice
    
    case $log_choice in
        1) docker-compose -f $COMPOSE_FILE logs --tail=50 ;;
        2) 
            if docker ps --format "{{.Names}}" | grep -q "sayit-direct-backend"; then
                docker logs sayit-direct-backend --tail=50
            else
                echo "❌ 직접 백엔드가 실행되지 않음"
            fi
            ;;
        3) 
            echo "=== Worker 1 ==="
            docker logs sayit-worker-1-m2 --tail=20 2>/dev/null
            echo "=== Worker 2 ==="
            docker logs sayit-worker-2-m2 --tail=20 2>/dev/null
            echo "=== Worker 3 ==="
            docker logs sayit-worker-3-m2 --tail=20 2>/dev/null
            ;;
        4) docker logs sayit-redis-m2 --tail=30 ;;
        5) docker logs sayit-gateway-m2 --tail=20 2>/dev/null || echo "❌ Gateway 실행되지 않음" ;;
        *) echo "❌ 잘못된 선택입니다." ;;
    esac
}

test_connection() {
    echo "🧪 연결 테스트 시작..."
    
    # 로컬 연결 테스트
    echo "📍 로컬 연결 테스트:"
    curl -s http://localhost:3000/api/health && echo " ✅" || echo " ❌"
    
    # 외부 연결 테스트
    local_ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    echo "🌐 외부 연결 테스트 ($local_ip):"
    curl -s http://$local_ip:3000/api/health && echo " ✅" || echo " ❌"
    
    # 진단 API
    echo "🔍 시스템 진단:"
    curl -s http://localhost:3000/api/diagnose | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/api/diagnose
    
    # STT 테스트 (간단한 파일로)
    echo
    echo "🎙️ STT 기능 테스트:"
    if [ -f "./temp/voice-test.wav" ]; then
        echo "📁 테스트 파일로 STT 변환 테스트 중..."
        curl -X POST http://localhost:3000/api/transcribe \
          -F "audio=@./temp/voice-test.wav;type=audio/wav" \
          -F "language=auto" \
          -s | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f\"   ✅ STT 테스트: {data.get('success', False)}\")
    print(f\"   📝 방식: {data.get('method', 'Unknown')}\")
    print(f\"   🎙️ Whisper: {data.get('whisperInstalled', False)}\")
except:
    print('   ❌ STT 테스트 실패')
"
    else
        echo "   ⚠️ 테스트 파일 없음 (./temp/voice-test.wav)"
    fi
}

# 메인 루프
while true; do
    show_menu
    read -p "선택하세요 (0-9): " choice
    
    case $choice in
        1) start_system ;;
        2) stop_system ;;
        3) stop_system && sleep 3 && start_system ;;
        4) show_status ;;
        5) show_logs ;;
        6) fix_gateway_direct ;;
        7) test_connection ;;
        8) check_and_install_whisper ;;
        9) check_and_clean_queue ;;
        0) echo "👋 관리자를 종료합니다."; exit 0 ;;
        *) echo "❌ 잘못된 선택입니다." ;;
    esac
    
    
    echo
    read -p "계속하려면 Enter를 누르세요..."
done