# 🏗️ SayIt Backend 아키텍처 가이드

> SayIt 백엔드 서버의 전체적인 구조와 주요 컴포넌트에 대한 상세 가이드

## 📐 **전체 아키텍처 개요**

```
                    📱 Flutter SayIt App
                           │ HTTP/REST
                           ▼
            ┌─────────────────────────────┐
            │      Direct-Backend         │
            │   (즉시 처리 + API Gateway) │
            │     Port: 3000             │
            │     Model: Whisper Small   │
            │     RAM: 4GB               │
            └─────────────┬───────────────┘
                          │
                          ▼ (30초+ 파일)
            ┌─────────────────────────────┐
            │        Redis Cluster        │
            │      (Job Queue + Cache)    │
            │         Port: 6379          │
            │         RAM: 2GB            │
            └─────────────┬───────────────┘
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Worker-1   │   │  Worker-2   │   │  Worker-3   │
│  (Queue)    │   │  (Queue)    │   │  (Queue)    │
│  Model:     │   │  Model:     │   │  Model:     │
│  Small      │   │  Small      │   │  Small      │
│  RAM: 4GB   │   │  RAM: 4GB   │   │  RAM: 4GB   │
│  Chunks: 2  │   │  Chunks: 2  │   │  Chunks: 2  │
└─────────────┘   └─────────────┘   └─────────────┘
```

---

## 📱 **전체 시스템 구조**

### **🗂️ 프로젝트 구조**

```
backend_sayit/
├── 📁 routes/           # API 엔드포인트
│   ├── transcribe.js    # STT 변환 API 라우터
│   ├── health.js        # 헬스체크 API
│   └── upload.js        # 파일 업로드 처리
│
├── 📁 services/         # 핵심 비즈니스 로직
│   ├── audio-processor.js      # 음성 파일 전처리
│   ├── transcription-queue.js  # Bull 큐 관리 + Whisper 실행
│   ├── redis-result-bridge.js  # Redis 결과 관리
│   ├── result-collector.js     # 결과 수집 및 정리
│   └── whisper-optimizer.js    # 언어별 최적화 설정
│
├── 📁 middleware/       # Express 미들웨어
│   ├── upload.js        # Multer 파일 업로드 설정
│   ├── cors.js          # CORS 보안 설정
│   ├── security.js      # Helmet 보안 헤더
│   └── validation.js    # 요청 데이터 검증
│
├── 📁 utils/           # 유틸리티 함수
│   ├── file-manager.js  # 파일 생성/삭제 관리
│   ├── logger.js        # 통합 로그 시스템
│   └── config.js        # 환경 설정 관리
│
├── 📁 scripts/         # 운영 스크립트
│   ├── health-check.sh  # 컨테이너 상태 체크
│   ├── cleanup.sh       # 임시 파일 정리
│   └── backup.sh        # 데이터 백업
│
├── 📁 docker/          # Docker 설정
│   ├── Dockerfile       # 메인 앱 이미지
│   ├── Dockerfile.m2    # Mac M2 최적화 이미지
│   └── docker-compose-m2-distributed.yml
│
├── 📁 nginx/          # 리버스 프록시 (예정)
│   └── nginx.conf
│
├── 📁 docs/           # 📚 프로젝트 문서
│   ├── PROGRESS.md     # 진행 상황
│   ├── CHANGELOG.md    # 변경 로그
│   ├── API.md         # API 문서
│   ├── ARCHITECTURE.md # 이 문서
│   ├── PERFORMANCE.md  # 성능 최적화
│   └── TODO.md        # 할 일 목록
│
├── server.js          # Express 서버 진입점
├── package.json       # 의존성 및 스크립트
└── README.md         # 프로젝트 개요
```

---

## 🏗️ **컴포넌트별 상세 구조**

### **1. Direct-Backend (API Gateway)**

**역할**: API 요청 처리 및 즉시 변환

```yaml
Container: sayit-direct-backend
Port: 3000
Resources: 4GB RAM, 2 CPU Core
Model: Whisper Small
Environment:
  - WORKER_MODE=api_only
  - MAX_CONCURRENT_CHUNKS=4
  - QUEUE_PROCESSING=false
```

**처리 방식**:
- 소용량 파일 (< 30초): 즉시 처리
- 대용량 파일 (> 30초): Redis 큐로 분산

**주요 기능**:
```javascript
// server.js - 메인 서버 설정
app.use('/api/transcribe', transcribeRouter);
app.use('/health', healthRouter);
app.use(cors(), helmet(), morgan('combined'));

// 파일 크기 기반 처리 분기
const shouldUseAsync = (fileSize, duration) => {
  return duration > 30 || fileSize > 10 * 1024 * 1024; // 30초 or 10MB
};
```

### **2. Worker Nodes (Queue Processors)**

**역할**: 큐 작업 전용 처리

```yaml
Containers: 
  - sayit-worker-1-m2
  - sayit-worker-2-m2  
  - sayit-worker-3-m2
Resources: 각 4GB RAM, 2 CPU Core
Model: Whisper Small
Environment:
  - WORKER_MODE=queue_only
  - MAX_CONCURRENT_CHUNKS=2
  - QUEUE_PROCESSING=true
```

**처리 로직**:
```javascript
// services/transcription-queue.js
const transcriptionQueue = new Bull('transcription', {
  redis: { host: 'redis', port: 6379 },
  settings: {
    stalledInterval: 30 * 1000,
    maxStalledCount: 1
  }
});

// 언어별 최적화 설정
function getLanguageOptimizedSettings(language) {
  const baseSettings = {
    model: 'small',
    task: 'transcribe',
    output_format: 'txt',
    verbose: 'False'
  };

  switch (language) {
    case 'ko': // 한국어 Level 2 최적화
      return {
        ...baseSettings,
        language: 'ko',
        temperature: '0.2',
        beam_size: '5',
        best_of: '3',
        patience: '2.0',
        condition_on_previous_text: 'True'
      };
    case 'en': // 영어 Level 2 최적화
      return {
        ...baseSettings,
        language: 'en',
        temperature: '0.3',
        beam_size: '5',
        best_of: '3',
        patience: '1.5',
        condition_on_previous_text: 'True'
      };
    default: // 자동 감지
      return {
        ...baseSettings,
        temperature: '0.25',
        beam_size: '3',
        best_of: '2',
        patience: '1.8'
      };
  }
}
```

### **3. Redis Cluster**

**역할**: 작업 큐 및 캐싱

```yaml
Container: sayit-redis-m2
Port: 6379
Resources: 2GB RAM, 1 CPU Core
Configuration:
  - maxmemory: 1536mb
  - policy: allkeys-lru
  - persistence: AOF enabled
```

**데이터 구조**:
```redis
# Bull 큐 데이터
bull:transcription:waiting        # 대기 중인 작업
bull:transcription:active         # 처리 중인 작업
bull:transcription:completed      # 완료된 작업
bull:transcription:failed         # 실패한 작업

# 결과 캐시 (24시간 TTL)
result:${jobId}                   # 변환 결과 저장
progress:${jobId}                 # 진행 상황 추적

# 통계 데이터
stats:daily:requests              # 일일 요청 수
stats:daily:success_rate          # 성공률
stats:performance:avg_time        # 평균 처리 시간
```

---

## 🔄 **데이터 플로우**

### **🚀 즉시 처리 플로우 (< 30초)**

```
1. 📱 Flutter App → POST /api/transcribe (파일 업로드)
                    ↓
2. 🔍 Direct-Backend → 파일 분석 (크기, 예상 길이)
                    ↓ (< 30초 판단)
3. 🎙️ Whisper Small → 언어별 최적화 설정 적용
                    ↓
4. 📝 STT 변환 → 즉시 처리 (2-5초)
                    ↓
5. 📱 Flutter App ← JSON 응답 (transcription)
```

### **📊 큐 처리 플로우 (> 30초)**

```
1. 📱 Flutter App → POST /api/transcribe (파일 업로드)
                    ↓
2. 🔍 Direct-Backend → 파일 분석 (크기, 예상 길이)
                    ↓ (> 30초 판단)
3. 🗂️ Redis Queue → Bull 큐에 작업 등록
                    ↓
4. 📱 Flutter App ← jobId 반환 (즉시)
                    
5. 📊 Worker Node → 큐에서 작업 획득
                    ↓
6. 📁 청크 분할 → 대용량 파일을 작은 단위로 분할
                    ↓
7. 🎙️ Whisper Small → 청크별 병렬 STT 변환
                    ↓
8. 🔗 결과 병합 → 청크 결과를 하나로 합침
                    ↓
9. 💾 Redis Cache → 최종 결과 저장 (24시간 TTL)

10. 📱 Flutter App → GET /api/transcribe/:jobId (폴링)
                    ↓
11. 📱 Flutter App ← 완료된 transcription 반환
```

---

## ⚙️ **언어별 최적화 시스템**

### **🎯 최적화 매트릭스**

| 언어 | Temperature | Beam Size | Patience | Best Of | 문맥 연결 | 특화 설정 |
|------|------------|-----------|----------|---------|-----------|-----------|
| **한국어** | 0.2 | 5 | 2.0 | 3 | ✅ | 일관성 중시 |
| **영어** | 0.3 | 5 | 1.5 | 3 | ✅ | 빠른 처리 |
| **자동감지** | 0.25 | 3 | 1.8 | 2 | ✅ | 보수적 |

### **🔧 설정 로직**

```javascript
// services/whisper-optimizer.js
class WhisperOptimizer {
  static getOptimizedArgs(language, audioPath) {
    const settings = this.getLanguageSettings(language);
    
    return [
      'whisper', audioPath,
      '--model', settings.model,
      '--task', settings.task,
      '--output_format', settings.output_format,
      '--temperature', settings.temperature,
      '--beam_size', settings.beam_size,
      '--best_of', settings.best_of,
      '--patience', settings.patience,
      '--condition_on_previous_text', settings.condition_on_previous_text,
      ...(settings.language ? ['--language', settings.language] : [])
    ];
  }
  
  static estimateProcessingTime(duration, language) {
    const baseTime = duration * 0.3; // 30% of audio length
    const languageMultiplier = {
      'ko': 1.2, // 한국어는 20% 더 시간 소요
      'en': 1.0, // 영어는 기준
      'auto': 1.4 // 자동 감지는 40% 더 시간 소요
    };
    
    return Math.ceil(baseTime * (languageMultiplier[language] || 1.0));
  }
}
```

---

## 🐳 **Docker 분산 환경**

### **컨테이너 구성**

```yaml
# docker-compose-m2-distributed.yml
version: '3.8'
services:
  # Redis 클러스터
  redis:
    image: redis:alpine
    container_name: sayit-redis-m2
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --maxmemory 1536mb --maxmemory-policy allkeys-lru
    
  # Direct Backend (API Gateway)
  direct-backend:
    build:
      context: .
      dockerfile: Dockerfile.m2
    container_name: sayit-direct-backend
    ports:
      - "3000:3000"
    environment:
      - WORKER_MODE=api_only
      - MAX_CONCURRENT_CHUNKS=4
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    volumes:
      - ./uploads:/app/uploads
      - ./temp:/app/temp
    deploy:
      resources:
        limits:
          memory: 4GB
          cpus: '2'

  # Worker 노드들
  whisper-worker-1:
    build:
      context: .
      dockerfile: Dockerfile.m2
    container_name: sayit-worker-1-m2
    environment:
      - WORKER_MODE=queue_only
      - MAX_CONCURRENT_CHUNKS=2
      - REDIS_URL=redis://redis:6379
      - WORKER_ID=worker-1
    depends_on:
      - redis
    volumes:
      - ./temp:/app/temp
    deploy:
      resources:
        limits:
          memory: 4GB
          cpus: '2'

  # ... worker-2, worker-3 동일한 설정
```

### **🔧 리소스 할당**

```
총 시스템 리소스:
├── CPU: 9 Core (Direct:2 + Worker1:2 + Worker2:2 + Worker3:2 + Redis:1)
├── RAM: 18GB (Direct:4GB + Worker1:4GB + Worker2:4GB + Worker3:4GB + Redis:2GB)
└── 동시 처리: 10개 청크 (Direct:4 + Worker1:2 + Worker2:2 + Worker3:2)

처리 용량 계산:
├── 소용량 파일 (<30초): Direct에서 즉시 처리 (4개 동시)
├── 중용량 파일 (30초-2분): Worker 분산 처리 (6개 동시)
└── 대용량 파일 (2분+): 청크 분할 후 Worker 처리
```

---

## 📊 **성능 최적화**

### **🚀 처리 속도 최적화**

1. **스마트 분기 로직**:
   ```javascript
   // 30초 기준 자동 분기
   const shouldUseAsync = (estimatedDuration) => {
     return estimatedDuration > 30;
   };
   ```

2. **적응형 폴링**:
   ```javascript
   // 처음 30초는 3초 간격, 이후 5초 간격
   const getPollingInterval = (elapsed) => {
     return elapsed < 30 ? 3000 : 5000;
   };
   ```

3. **청크 병렬 처리**:
   ```javascript
   // 대용량 파일을 30초 단위로 분할
   const chunkDuration = 30; // seconds
   const chunks = splitAudioIntoChunks(audioFile, chunkDuration);
   
   // 병렬 처리
   const results = await Promise.all(
     chunks.map(chunk => processChunk(chunk))
   );
   ```

### **💾 메모리 효율성**

1. **임시 파일 관리**:
   ```javascript
   // 처리 완료 후 자동 정리
   const cleanup = async (jobId) => {
     await fs.remove(`/tmp/job-${jobId}`);
     console.log(`🗑️ 임시 파일 정리 완료: ${jobId}`);
   };
   ```

2. **Redis 메모리 최적화**:
   ```redis
   # LRU 정책으로 자동 메모리 관리
   CONFIG SET maxmemory-policy allkeys-lru
   CONFIG SET maxmemory 1536mb
   ```

---

## 🔒 **보안 아키텍처**

### **📝 입력 검증**

```javascript
// middleware/validation.js
const validateFileUpload = (req, res, next) => {
  const file = req.file;
  
  // 파일 존재 확인
  if (!file) {
    return res.status(400).json({
      success: false,
      error: { code: 'FILE_REQUIRED', message: '파일이 필요합니다.' }
    });
  }
  
  // 파일 크기 제한 (100MB)
  if (file.size > 100 * 1024 * 1024) {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: '파일이 너무 큽니다.' }
    });
  }
  
  // MIME 타입 검증
  const allowedMimeTypes = [
    'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac'
  ];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_FORMAT', message: '지원하지 않는 파일 형식입니다.' }
    });
  }
  
  next();
};
```

### **🛡️ 보안 미들웨어**

```javascript
// middleware/security.js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  },
  hsts: { maxAge: 31536000 }
}));

// CORS 설정
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-flutter-app.com'
  ],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

## 📈 **모니터링 & 로깅**

### **📊 헬스체크 시스템**

```javascript
// routes/health.js
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      whisper: await checkWhisperStatus(),
      redis: await checkRedisStatus(),
      workers: await checkWorkerStatus()
    },
    stats: await getPerformanceStats()
  };
  
  res.json({ success: true, data: health });
});
```

### **📝 통합 로그 시스템**

```javascript
// utils/logger.js
class Logger {
  static info(message, context = 'SERVER') {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [${context}] INFO: ${message}`);
  }
  
  static error(message, error = null, context = 'SERVER') {
    const timestamp = new Date().toISOString();
    console.error(`${timestamp} [${context}] ERROR: ${message}`);
    if (error) console.error(error.stack);
  }
  
  static performance(operation, duration, context = 'PERF') {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [${context}] ${operation}: ${duration}ms`);
  }
}
```

---

## 🚀 **확장성 고려사항**

### **📈 수평 확장 (Scale Out)**

1. **워커 노드 추가**:
   ```bash
   # docker-compose에 새 워커 추가
   docker-compose -f docker-compose-m2-distributed.yml up --scale whisper-worker=5 -d
   ```

2. **로드 밸런서 도입** *(예정)*:
   ```nginx
   upstream sayit_backend {
       server direct-backend:3000;
       server direct-backend-2:3000;
   }
   ```

### **🔧 수직 확장 (Scale Up)**

1. **메모리 증량**:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 8GB  # 4GB → 8GB
         cpus: '4'    # 2 → 4
   ```

2. **Whisper Medium 모델** *(예정)*:
   ```javascript
   // 더 높은 정확도, 더 많은 메모리 필요
   model: 'medium' // small → medium
   ```

---

**🏗️ 이 아키텍처를 통해 SayIt 백엔드는 높은 성능과 확장성을 동시에 제공합니다!**

---

**관련 문서**: [진행 상황](PROGRESS.md) | [API 문서](API.md) | [성능 최적화](PERFORMANCE.md) | [할 일 목록](TODO.md)
