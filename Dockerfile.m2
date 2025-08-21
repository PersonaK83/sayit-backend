 # Dockerfile.m2 (ARM64 최적화)
FROM --platform=linux/arm64 node:18-bullseye

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

# Python Virtual Environment 생성 (ARM64 최적화)
RUN python3 -m venv /opt/whisper-env

# ARM64 최적화 Whisper 설치
RUN /opt/whisper-env/bin/pip install --no-cache-dir \
    openai-whisper \
    torch \
    torchaudio \
    --extra-index-url https://download.pytorch.org/whl/cpu

# whisper 명령어를 전역에서 사용 가능하도록 링크
RUN ln -s /opt/whisper-env/bin/whisper /usr/local/bin/whisper

# 비루트 사용자 생성
RUN groupadd -r nodejs && useradd -r -g nodejs -m -d /home/nodejs nodejs

# 권한 설정
RUN chown -R nodejs:nodejs /opt/whisper-env
RUN mkdir -p /home/nodejs/.cache/whisper && \
    chown -R nodejs:nodejs /home/nodejs/.cache

# Node.js 의존성 설치
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 애플리케이션 코드 복사
COPY . .

# 필요한 디렉토리 생성
RUN mkdir -p uploads temp logs && chmod 755 uploads temp logs

# 소유권 변경
RUN chown -R nodejs:nodejs /app

# 사용자 전환
USER nodejs

# M2 최적화 환경 변수
ENV PYTORCH_ENABLE_MPS_FALLBACK=1
ENV OMP_NUM_THREADS=6
ENV WHISPER_CACHE_DIR=/tmp/whisper

# 포트 노출
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# 애플리케이션 시작
CMD ["node", "server.js"]