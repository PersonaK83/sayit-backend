# Debian 기반 Node.js 이미지 사용 (Ubuntu와 유사하며 Python 환경이 안정적)
FROM node:18-bullseye

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 패키지 업데이트 및 필요한 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python Virtual Environment 생성
RUN python3 -m venv /opt/whisper-env

# Virtual Environment에서 Whisper 설치
RUN /opt/whisper-env/bin/pip install --no-cache-dir openai-whisper

# whisper 명령어를 전역에서 사용 가능하도록 링크
RUN ln -s /opt/whisper-env/bin/whisper /usr/local/bin/whisper

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치 (프로덕션 모드)
RUN npm ci --only=production && npm cache clean --force

# 애플리케이션 소스 복사
COPY . .

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p uploads && chmod 755 uploads

# 비루트 사용자 생성 및 권한 설정
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
RUN chown -R nodejs:nodejs /app

# PATH에 Virtual Environment 추가
ENV PATH="/opt/whisper-env/bin:$PATH"

# 비루트 사용자로 전환
USER nodejs

# 포트 노출
EXPOSE 3000

# 헬스체크 설정
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 서버 시작
CMD ["npm", "start"] 