# Node.js 18 기반 이미지
FROM node:18-slim

# 작업 디렉토리 설정
WORKDIR /app

# Python과 필요한 도구들 설치 (Whisper용)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Whisper 설치
RUN pip3 install openai-whisper

# package.json 복사 및 의존성 설치
COPY package*.json ./
RUN npm install --production

# 소스 코드 복사
COPY . .

# 업로드 디렉토리 생성
RUN mkdir -p uploads

# 포트 노출
EXPOSE 3000

# 애플리케이션 시작
CMD ["npm", "start"] 