
## 🚀 Windows

# Node.js 18 Alpine 이미지 사용 (경량화)
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 패키지 업데이트 및 필요한 패키지 설치
RUN apk update && apk add --no-cache \
    curl \
    python3 \
    py3-pip \
    ffmpeg \
    && rm -rf /var/cache/apk/*

# OpenAI Whisper 설치
RUN pip3 install --no-cache-dir openai-whisper

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치 (프로덕션 모드)
RUN npm ci --only=production && npm cache clean --force

# 애플리케이션 소스 복사
COPY . .

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p uploads && chmod 755 uploads

# 비루트 사용자 생성 및 권한 설정
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# 비루트 사용자로 전환
USER nodejs

# 포트 노출
EXPOSE 3000

# 헬스체크 설정
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 서버 시작
CMD ["npm", "start"] 