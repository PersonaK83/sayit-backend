# 1. 컨테이너에서 Whisper 설치
docker exec -it sayit-direct-backend bash -c "
pip3 install openai-whisper
whisper --help
"

# 2. 컨테이너 재시작
docker restart sayit-direct-backend

# 3. 10초 대기 후 확인
sleep 10
curl http://localhost:3000/api/diagnose