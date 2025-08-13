# Node.js 18 기반 이미지
FROM node:18-slim

# 작업 디렉토리 설정
WORKDIR /app

# Python과 필요한 도구들 설치 (Whisper용)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python 가상환경 생성 및 Whisper 설치
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --upgrade pip
RUN pip install openai-whisper

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

# 애플리케이션 시작
CMD ["npm", "start"]