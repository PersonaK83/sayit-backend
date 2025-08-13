const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const transcribeRoutes = require('./routes/transcribe');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // 모든 IP에서 접근 허용

// 보안 미들웨어
app.use(helmet());

// CORS 설정 (더 관대하게)
app.use(cors({
  origin: function (origin, callback) {
    // 개발 환경에서는 모든 origin 허용
    if (process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      if (!origin || allowedOrigins.includes(origin) || process.env.ALLOWED_ORIGINS === '*') {
        callback(null, true);
      } else {
        callback(new Error('CORS 정책에 의해 차단되었습니다.'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));

// 로깅 미들웨어
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing 미들웨어
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 정적 파일 서빙
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 기본 라우트
app.get('/', (req, res) => {
  res.json({
    message: 'SayIt STT 백엔드 서버가 정상 작동 중입니다! 🎙️',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    endpoints: {
      transcribe: 'POST /api/transcribe',
      health: 'GET /api/health',
      diagnose: 'GET /api/diagnose'
    }
  });
});

// Health check 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API 라우트
app.use('/api', transcribeRoutes);

// 404 및 에러 핸들러
app.use(notFound);
app.use(errorHandler);

// 서버 시작 (모든 IP에서 접근 허용)
app.listen(PORT, HOST, () => {
  console.log(`🚀 SayIt 백엔드 서버가 실행 중입니다!`);
  console.log(`📍 서버 주소: http://${HOST}:${PORT}`);
  console.log(`🌐 로컬 접근: http://localhost:${PORT}`);
  console.log(`📱 모바일 접근: http://[실제IP]:${PORT}`);
  console.log(`🔧 환경: ${process.env.NODE_ENV || 'development'}`);
  
  // 네트워크 정보 출력
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  console.log('\n📡 네트워크 인터페이스:');
  Object.keys(networkInterfaces).forEach(interfaceName => {
    networkInterfaces[interfaceName].forEach(network => {
      if (network.family === 'IPv4' && !network.internal) {
        console.log(`   ${interfaceName}: http://${network.address}:${PORT}`);
      }
    });
  });
  
  // OpenAI API 키 확인
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.log('\n⚠️  OpenAI API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.');
  } else {
    console.log('\n✅ OpenAI API 키가 설정되었습니다.');
  }

  // Render.com 슬립 모드 방지 (프로덕션에서만)
  if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
    console.log('\n🏓 Keep-alive 서비스 시작됨 (Render 슬립 모드 방지)');
    
    const https = require('https');
    setInterval(() => {
      const url = process.env.RENDER_EXTERNAL_URL;
      https.get(`${url}/api/health`, (res) => {
        console.log(`🏓 Keep-alive ping: ${res.statusCode} at ${new Date().toISOString()}`);
      }).on('error', (err) => {
        console.log('🏓 Keep-alive ping failed:', err.message);
      });
    }, 14 * 60 * 1000); // 14분마다 핑 (15분 제한 회피)
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 서버 종료 신호를 받았습니다. Graceful shutdown 중...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 서버 종료 신호를 받았습니다. Graceful shutdown 중...');
  process.exit(0);
}); 