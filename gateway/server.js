const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🌐 SayIt M2 API Gateway 시작 중...');

// 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// 워커 노드 목록 (Docker 내부 네트워크)
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

// 워커 헬스체크
async function checkWorkerHealth(workerUrl) {
  try {
    const response = await axios.get(`${workerUrl}/api/health`, { timeout: 3000 });
    return { url: workerUrl, healthy: true, data: response.data };
  } catch (error) {
    return { url: workerUrl, healthy: false, error: error.message };
  }
}

// Gateway 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'SayIt M2 API Gateway',
    workers: workers.length,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 시스템 진단 (워커 상태 포함)
app.get('/api/diagnose', async (req, res) => {
  console.log('🔍 시스템 진단 요청');
  
  const workerChecks = await Promise.all(
    workers.map(worker => checkWorkerHealth(worker))
  );
  
  const healthyWorkers = workerChecks.filter(w => w.healthy).length;
  
  res.json({
    gateway: {
      status: 'healthy',
      timestamp: new Date().toISOString()
    },
    workers: {
      total: workers.length,
      healthy: healthyWorkers,
      details: workerChecks
    },
    loadBalancing: {
      algorithm: 'round-robin',
      currentWorker: currentWorker
    }
  });
});

// 큐 상태 확인
app.get('/api/queue-status', async (req, res) => {
  try {
    // Redis 연결해서 큐 상태 확인
    const Redis = require('redis');
    const redis = Redis.createClient({
      host: process.env.REDIS_HOST || 'sayit-redis-m2',
      port: 6379
    });
    
    await redis.connect();
    
    const queueInfo = await redis.info();
    const keys = await redis.keys('bull:*');
    
    await redis.disconnect();
    
    res.json({
      redis: 'connected',
      queueKeys: keys.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Redis 연결 실패',
      message: error.message
    });
  }
});

// 메인 API 프록시 (STT 요청)
app.use('/api', async (req, res) => {
  const targetWorker = getNextWorker();
  
  console.log(`🔄 ${new Date().toISOString()} - ${req.method} ${req.originalUrl} → ${targetWorker}`);
  
  try {
    const config = {
      method: req.method.toLowerCase(),
      url: `${targetWorker}${req.originalUrl}`,
      timeout: 300000, // 5분 타임아웃
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    };
    
    // GET 요청
    if (req.method === 'GET') {
      config.params = req.query;
    } 
    // POST 요청 (파일 업로드 포함)
    else if (req.method === 'POST') {
      config.data = req.body;
      config.headers = {
        'Content-Type': req.get('Content-Type') || 'application/json'
      };
    }
    
    const response = await axios(config);
    
    // 성공 응답
    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error(`❌ 프록시 오류 (${targetWorker}):`, error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: '워커 서버 오류',
        message: error.response.data || error.message,
        worker: targetWorker
      });
    } else {
      res.status(500).json({
        error: '게이트웨이 연결 오류',
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
      'GET /api/queue-status - 큐 상태',
      'POST /api/transcribe - 음성 변환'
    ],
    workers: workers.length,
    timestamp: new Date().toISOString()
  });
});

// 서버 시작
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

// 예외 처리
process.on('uncaughtException', (error) => {
  console.error('💥 예상치 못한 오류:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 처리되지 않은 Promise 거부:', reason);
});