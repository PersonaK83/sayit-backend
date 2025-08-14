# 🐳 Docker 설정 가이드

## 필요한 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 입력하세요:

```env
# OpenAI API 키 (필수)
OPENAI_API_KEY=your_openai_api_key_here

# 서버 포트
PORT=3000

# 환경 설정
NODE_ENV=production

# CORS 허용 오리진 (* = 모든 오리진 허용)
ALLOWED_ORIGINS=*

# Render.com 배포 URL (클라우드 배포 시 사용)
# RENDER_EXTERNAL_URL=https://your-app.onrender.com
```

## Windows PC에서 설치 및 실행

### 1. Git Clone
```cmd
git clone <your-repository-url>
cd backend_sayit
```

### 2. 환경 변수 설정
```cmd
# .env 파일 생성
echo OPENAI_API_KEY=your_actual_key_here > .env
echo PORT=3000 >> .env
echo NODE_ENV=production >> .env
echo ALLOWED_ORIGINS=* >> .env
```

### 3. Docker 빌드 및 실행
```cmd
# Docker Compose로 빌드 및 실행
docker-compose up --build -d

# 상태 확인
docker ps

# 로그 확인
docker-compose logs -f sayit-backend
```

### 4. 테스트
```cmd
# 로컬 테스트
curl http://localhost:3000/api/health

# 또는 브라우저에서
# http://localhost:3000
```

## Windows 방화벽 및 포트 포워딩 설정

### 1. Windows 방화벽
```cmd
# 관리자 권한으로 실행
netsh advfirewall firewall add rule name="SayIt Backend Docker" dir=in action=allow protocol=TCP localport=3000
```

### 2. 라우터 포트 포워딩
- 라우터 관리 페이지 접속 (보통 192.168.1.1)
- 포트 포워딩 설정: 외부 포트 3000 → 내부 포트 3000
- 내부 IP: Windows PC IP 주소

## 유용한 Docker 명령어

```cmd
# 컨테이너 시작
docker-compose up -d

# 컨테이너 중지
docker-compose down

# 컨테이너 재시작
docker-compose restart

# 로그 확인
docker-compose logs -f sayit-backend

# 컨테이너 내부 접속
docker exec -it sayit-backend sh

# 이미지 재빌드
docker-compose up --build -d

# 모든 컨테이너 및 이미지 정리
docker system prune -a
```

## 문제 해결

### 포트 충돌 시
```cmd
# 포트 사용 중인 프로세스 확인
netstat -ano | findstr :3000

# 프로세스 종료 (PID 확인 후)
taskkill /PID <PID> /F
```

### 권한 문제 시
```cmd
# Docker Desktop을 관리자 권한으로 실행
# 또는 사용자를 docker-users 그룹에 추가
``` 