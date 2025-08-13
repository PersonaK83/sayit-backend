# Node.js 18 기반 이미지
FROM node:18-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 업데이트 및 Python 도구 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python 가상환경 생성 및 활성화
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# pip 업그레이드 및 Whisper 설치
RUN /opt/venv/bin/pip install --upgrade pip
RUN /opt/venv/bin/pip install openai-whisper

# Whisper tiny 모델 사전 다운로드 (빌드 시 미리 다운로드)
RUN /opt/venv/bin/python -c "import whisper; whisper.load_model('tiny')"

# Whisper 설치 확인
RUN /opt/venv/bin/python -c "import whisper; print('Whisper 설치 및 모델 준비 완료!')"

# package.json 복사 및 의존성 설치
COPY package*.json ./
RUN npm install --production

# 소스 코드 복사
COPY . .

# 업로드 디렉토리 생성
RUN mkdir -p uploads

# 포트 노출
EXPOSE 3000

# 환경 변수 설정 (가상환경 PATH 유지)
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHON_PATH="/opt/venv/bin/python"

# 애플리케이션 시작
CMD ["npm", "start"]