# Node.js 18 기반 이미지
FROM node:18-slim

# 작업 디렉토리 설정
WORKDIR /app

# 🔧 Puppeteer에 필요한 최소한의 패키지만 설치
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libgtk-4-1 \
    libnspr4 \
    libnss3 \
    libxss1 \
    libgconf-2-4 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# package.json 복사 및 의존성 설치 (Puppeteer 포함)
COPY package*.json ./
RUN npm install --production

# 🚀 Puppeteer 브라우저 사전 다운로드 (빌드 시간에 처리)
RUN npx puppeteer browsers install chrome

# 소스 코드 복사
COPY . .

# 업로드 디렉토리 생성
RUN mkdir -p uploads

# 포트 노출
EXPOSE 3000

# 🔧 Puppeteer 환경 변수 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# 애플리케이션 시작
CMD ["npm", "start"]