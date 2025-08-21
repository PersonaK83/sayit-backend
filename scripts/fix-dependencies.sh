cd /Users/hyemoonjung/backend_server/nodejs/backend_sayit

# Gateway 디렉토리 및 서버 파일 생성
mkdir -p gateway

cat > gateway/server.js << 'EOF'
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS 미들웨어
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// JSON 파싱
app.use(express.json({ limit: '100mb' }));

// 워커 노드 목록
const workers = [
  'http://sayit-worker-1-m2:3000',
  'http://sayit-worker-2-m2:3000', 
  'http://sayit-worker-3-m2:3000'
];

let currentWorker = 0;

// 로드 밸런싱 (라운드 로빈)
function getNextWorker() {
  const worker = workers[currentWorker];
  currentWorker = (currentWorker + 1) % workers.length;
  return worker;
}

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'SayIt M2 API Gateway',
    workers: workers.length,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 시스템 진단
app.get('/api/diagnose', async (req, res) => {
  const axios = require('axios');
  const workerStatus = [];
  
  for (let i = 0; i < workers.length; i++) {
    try {
      const response = await axios.get(`${workers[i]}/api/health`, { timeout: 5000 });
      workerStatus.push({
        worker: `worker-${i + 1}`,
        url: workers[i],
        status: 'healthy',
        response: response.data
      });
    } catch (error) {
      workerStatus.push({
        worker: `worker-${i + 1}`,
        url: workers[i],
        status: 'unhealthy',
        error: error.message
      });
    }
  }
  
  res.json({
    gateway: 'healthy',
    workers: workerStatus,
    timestamp: new Date().toISOString()
  });
});

// 모든 API 요청을 워커로 프록시
app.use('/api', async (req, res) => {
  const axios = require('axios');
  const targetWorker = getNextWorker();
  
  console.log(`🔄 ${new Date().toISOString()} - ${req.method} ${req.url} → ${targetWorker}`);
  
  try {
    const config = {
      method: req.method.toLowerCase(),
      url: `${targetWorker}${req.url}`,
      data: req.body,
      headers: { ...req.headers },
      timeout: 300000, // 5분 타임아웃
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    };
    
    // Host 헤더 제거 (프록시 시 문제 발생 가능)
    delete config.headers.host;
    
    const response = await axios(config);
    
    // 응답 헤더 복사
    Object.keys(response.headers).forEach(key => {
      res.set(key, response.headers[key]);
    });
    
    res.status(response.status).send(response.data);
    
  } catch (error) {
    console.error(`❌ 프록시 오류: ${error.message}`);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: '워커 서버 오류',
        message: error.response.data || error.message,
        worker: targetWorker
      });
    } else {
      res.status(500).json({
        error: '게이트웨이 오류',
        message: error.message,
        worker: targetWorker
      });
    }
  }
});

// 루트 경로
app.get('/', (req, res) => {
  res.json({
    service: 'SayIt M2 API Gateway',
    status: 'running',
    endpoints: [
      'GET /api/health - 헬스체크',
      'GET /api/diagnose - 시스템 진단',
      'POST /api/transcribe - 음성 변환'
    ],
    workers: workers.length,
    timestamp: new Date().toISOString()
  });
});

// 에러 핸들링
app.use((error, req, res, next) => {
  console.error('💥 서버 오류:', error);
  res.status(500).json({ 
    error: '서버 내부 오류',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('🌐 SayIt M2 API Gateway 시작됨');
  console.log(`📍 포트: ${PORT}`);
  console.log(`⚡ 워커 노드: ${workers.length}개`);
  console.log('📋 워커 목록:');
  workers.forEach((worker, index) => {
    console.log(`   ${index + 1}. ${worker}`);
  });
  console.log('========================================');
});
EOF

echo "✅ Gateway 서버 파일 생성 완료!"