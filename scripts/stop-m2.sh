 #!/bin/bash
# scripts/stop-m2.sh

echo "========================================="
echo "   🛑 SayIt M2 분산처리 시스템 중지"
echo "========================================="
echo

echo "1. 일반 중지 (컨테이너만 중지)"
echo "2. 완전 정리 (볼륨, 네트워크 포함)"
echo "3. 취소"
echo
read -p "선택하세요 (1-3): " choice

case $choice in
    1)
        echo "🛑 컨테이너 중지 중..."
        docker-compose -f docker-compose-m2-distributed.yml stop
        echo "✅ 컨테이너가 중지되었습니다."
        ;;
    2)
        echo "🧹 완전 정리 중..."
        docker-compose -f docker-compose-m2-distributed.yml down -v
        echo "🗑️ 사용하지 않는 이미지 정리 중..."
        docker image prune -f
        echo "✅ 완전 정리가 완료되었습니다."
        ;;
    3)
        echo "❌ 취소되었습니다."
        exit 0
        ;;
    *)
        echo "❌ 잘못된 선택입니다."
        exit 1
        ;;
esac