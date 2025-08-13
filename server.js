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
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS 정책에 의해 차단되었습니다.'));
      }
    }
  },
  credentials: true
}));

// 로깅 미들웨어
app.use(morgan('combined'));

// JSON 파싱 미들웨어
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// 정적 파일 서빙
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 라우트 설정
app.use('/api', transcribeRoutes);

// 기본 라우트
app.get('/', (req, res) => {
  res.json({
    message: 'SayIt STT 백엔드 서버가 정상 작동 중입니다! 🎙️',
    version: '1.0.0',
    serverInfo: {
      host: HOST,
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development'
    },
    endpoints: {
      transcribe: 'POST /api/transcribe',
      health: 'GET /api/health',
      diagnose: 'GET /api/diagnose'
    }
  });
});

// 헬스 체크 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    clientIP: req.ip,
    serverHost: HOST,
    serverPort: PORT
  });
});

// 에러 처리 미들웨어
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