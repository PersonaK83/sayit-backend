#!/bin/bash
# scripts/manage-m2.sh

show_menu() {
    echo "========================================="
    echo "   🍎 SayIt M2 분산처리 관리자"
    echo "========================================="
    echo "1. 🚀 시스템 시작"
    echo "2. 🛑 시스템 중지"
    echo "3. 🔄 시스템 재시작"
    echo "4. 📊 상태 확인"
    echo "5. 📋 로그 확인"
    echo "6. 📈 실시간 모니터링"
    echo "7. 🧪 성능 테스트"
    echo "8. 🔧 환경 설정"
    echo "0. 종료"
    echo "========================================="
}

while true; do
    show_menu
    read -p "선택하세요 (0-8): " choice
    
    case $choice in
        1)
            echo "🚀 시스템 시작 중..."
            ./scripts/start-m2.sh
            ;;
        2)
            echo "🛑 시스템 중지 중..."
            ./scripts/stop-m2.sh
            ;;
        3)
            echo "🔄 시스템 재시작 중..."
            ./scripts/stop-m2.sh
            sleep 3
            ./scripts/start-m2.sh
            ;;
        4)
            ./scripts/status-m2.sh
            ;;
        5)
            echo "로그 옵션: gateway, worker1, worker2, worker3, redis, all"
            read -p "로그 유형을 선택하세요: " log_type
            ./scripts/logs-m2.sh $log_type
            ;;
        6)
            ./scripts/monitor-m2.sh
            ;;
        7)
            ./scripts/benchmark-m2.sh
            ;;
        8)
            ./scripts/setup-m2.sh
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