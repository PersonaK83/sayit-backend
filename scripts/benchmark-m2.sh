 #!/bin/bash

echo "🚀 M2 분산처리 성능 테스트 시작"

# 테스트 파일 준비 (5분 샘플 오디오)
TEST_FILE="test-5min.aac"

# 동시 요청 테스트
for i in {1..5}; do
    echo "📤 테스트 $i 시작..."
    curl -X POST \
         -F "audio=@$TEST_FILE" \
         -F "language=ko" \
         -F "async=true" \
         http://localhost:3000/api/transcribe &
done

wait
echo "✅ 동시 요청 테스트 완료"

# 시스템 리소스 확인
./scripts/status-m2.sh