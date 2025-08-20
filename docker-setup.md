# 🐳 Docker 설정 가이드

## 필요한 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 입력하세요:

```env
# OpenAI API 키 (필수)
OPENAI_API_KEY=your_openai_api_key_here

# 서버 포트
PORT=3000

# 환경 설정
NODE_ENV=production

# CORS 허용 오리진 (* = 모든 오리진 허용)
ALLOWED_ORIGINS=*

# Render.com 배포 URL (클라우드 배포 시 사용)
# RENDER_EXTERNAL_URL=https://your-app.onrender.com
```

## Windows PC에서 설치 및 실행

### 1. Git Clone
```cmd
git clone <your-repository-url>
cd backend_sayit
```

### 2. 환경 변수 설정
```cmd
# .env 파일 생성
echo OPENAI_API_KEY=your_actual_key_here > .env
echo PORT=3000 >> .env
echo NODE_ENV=production >> .env
echo ALLOWED_ORIGINS=* >> .env
```

### 3. Docker 빌드 및 실행
```cmd
# Docker Compose로 빌드 및 실행
docker-compose up --build -d

# 상태 확인
docker ps

# 로그 확인
docker-compose logs -f sayit-backend
```

### 4. 테스트
```cmd
# 로컬 테스트
curl http://localhost:3000/api/health

# 또는 브라우저에서
# http://localhost:3000
```

## Windows 방화벽 및 포트 포워딩 설정

### 1. Windows 방화벽
```cmd
# 관리자 권한으로 실행
netsh advfirewall firewall add rule name="SayIt Backend Docker" dir=in action=allow protocol=TCP localport=3000
```

### 2. 라우터 포트 포워딩
- 라우터 관리 페이지 접속 (보통 192.168.1.1)
- 포트 포워딩 설정: 외부 포트 3000 → 내부 포트 3000
- 내부 IP: Windows PC IP 주소

## 유용한 Docker 명령어

```cmd
# 컨테이너 시작
docker-compose up -d

# 컨테이너 중지
docker-compose down

# 컨테이너 재시작
docker-compose restart

# 로그 확인
docker-compose logs -f sayit-backend

# 컨테이너 내부 접속
docker exec -it sayit-backend sh

# 이미지 재빌드
docker-compose up --build -d

# 모든 컨테이너 및 이미지 정리
docker system prune -a
```

## 문제 해결

### 포트 충돌 시
```cmd
# 포트 사용 중인 프로세스 확인
netstat -ano | findstr :3000

# 프로세스 종료 (PID 확인 후)
taskkill /PID <PID> /F
```

### 권한 문제 시
```cmd
# Docker Desktop을 관리자 권한으로 실행
# 또는 사용자를 docker-users 그룹에 추가
``` 

## 🎯 **30분 제한 + 큐 시스템 분석**

훌륭한 아이디어입니다! 30분 제한과 큐 시스템을 통한 성능 최적화 방안을 분석해보겠습니다.

## 📊 **큐 시스템의 성능 효과 분석**

### **현재 상황 (큐 없음)**
```
사용자 A: 10분 파일 → 2-4분 처리 (전체 리소스 독점)
사용자 B: 5분 파일 → 대기... → 1-2분 처리
사용자 C: 15분 파일 → 대기... → 대기... → 3-6분 처리

총 처리 시간: 6-12분 (순차 대기)
```

### **큐 시스템 적용 후**
```
사용자 A: 10분 파일 → 5개 청크(2분씩) → 큐에 분산
사용자 B: 5분 파일 → 3개 청크(1.7분씩) → 큐에 분산  
사용자 C: 15분 파일 → 8개 청크(1.9분씩) → 큐에 분산

병렬 처리: 여러 청크 동시 처리 가능
총 처리 시간: 3-6분 (50% 단축 가능)
```

## 🚀 **성능 향상 예상 효과**

### **1. 처리 속도 향상**
- **단일 사용자**: 20-30% 향상 (청크 병렬 처리)
- **다중 사용자**: 40-60% 향상 (리소스 효율적 분배)
- **대기 시간**: 70-80% 단축 (즉시 큐 진입)

### **2. 시스템 부하 분산**
- **메모리 사용**: 안정적 (청크별 2GB → 전체 파일 3-5GB)
- **CPU 활용**: 효율적 (유휴 시간 최소화)
- **응답성**: 향상 (사용자별 즉시 피드백)

## 🔧 **큐 시스템 구현 방안**

### **1. Redis 기반 큐 시스템**
```javascript
<code_block_to_apply_changes_from>
```

### **2. 큐 설정**
```javascript:/Users/hyemoonjung/backend_server/nodejs/backend_sayit/services/transcription-queue.js
const Queue = require('bull');
const redis = require('redis');

// Redis 연결 설정
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// 변환 큐 생성
const transcriptionQueue = new Queue('audio transcription', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 10,  // 완료된 작업 10개만 보관
    removeOnFail: 50,      // 실패한 작업 50개 보관
    attempts: 3,           // 최대 3번 재시도
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// 청크 처리 작업 정의
transcriptionQueue.process('chunk', 5, async (job) => {
  const { chunkPath, jobId, chunkIndex, totalChunks } = job.data;
  
  console.log(`🎵 청크 처리 시작 [${jobId}] ${chunkIndex + 1}/${totalChunks}`);
  
  try {
    // 청크 변환 처리
    const result = await transcribeChunk(chunkPath, jobId, chunkIndex);
    
    // 진행 상황 업데이트
    job.progress((chunkIndex + 1) / totalChunks * 100);
    
    return {
      chunkIndex,
      result,
      success: true
    };
  } catch (error) {
    console.error(`❌ 청크 처리 실패 [${jobId}] ${chunkIndex}:`, error);
    throw error;
  }
});

module.exports = transcriptionQueue;
```

### **3. 파일 분할 및 큐 등록**
```javascript:/Users/hyemoonjung/backend_server/nodejs/backend_sayit/services/audio-processor.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const transcriptionQueue = require('./transcription-queue');

// 오디오 파일 분할
async function splitAudioFile(audioFilePath, chunkDuration = 120) { // 2분 청크
  const jobId = generateJobId();
  const outputDir = path.join(__dirname, '../temp', jobId);
  
  // 임시 디렉토리 생성
  await fs.mkdir(outputDir, { recursive: true });
  
  return new Promise((resolve, reject) => {
    ffmpeg(audioFilePath)
      .inputOptions('-f mp3') // 또는 입력 형식에 맞게
      .outputOptions([
        '-f segment',
        `-segment_time ${chunkDuration}`,
        '-segment_format mp3',
        '-reset_timestamps 1'
      ])
      .output(path.join(outputDir, 'chunk_%03d.mp3'))
      .on('end', async () => {
        try {
          // 생성된 청크 파일 목록 가져오기
          const files = await fs.readdir(outputDir);
          const chunkFiles = files
            .filter(f => f.startsWith('chunk_'))
            .sort()
            .map(f => path.join(outputDir, f));
          
          resolve({ jobId, chunkFiles, outputDir });
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject)
      .run();
  });
}

// 큐에 청크 작업 등록
async function queueAudioTranscription(audioFilePath, language = 'auto') {
  try {
    // 1. 파일 분할
    console.log('🔪 오디오 파일 분할 시작...');
    const { jobId, chunkFiles, outputDir } = await splitAudioFile(audioFilePath);
    
    // 2. 각 청크를 큐에 등록
    const chunkJobs = chunkFiles.map((chunkPath, index) => {
      return transcriptionQueue.add('chunk', {
        chunkPath,
        jobId,
        chunkIndex: index,
        totalChunks: chunkFiles.length,
        language,
        outputDir
      }, {
        priority: 10 - index, // 첫 번째 청크가 높은 우선순위
        delay: index * 1000,   // 1초씩 지연하여 부하 분산
      });
    });
    
    console.log(`📋 큐에 ${chunkFiles.length}개 청크 등록 완료 [${jobId}]`);
    
    return {
      jobId,
      totalChunks: chunkFiles.length,
      queuedJobs: chunkJobs
    };
    
  } catch (error) {
    console.error('❌ 큐 등록 실패:', error);
    throw error;
  }
}

module.exports = {
  queueAudioTranscription,
  splitAudioFile
};
```

### **4. 결과 수집 및 병합**
```javascript:/Users/hyemoonjung/backend_server/nodejs/backend_sayit/services/result-collector.js
const EventEmitter = require('events');

class TranscriptionCollector extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map(); // jobId -> { chunks: [], totalChunks: 0, results: [] }
  }
  
  // 작업 등록
  registerJob(jobId, totalChunks) {
    this.jobs.set(jobId, {
      chunks: new Array(totalChunks).fill(null),
      totalChunks,
      results: [],
      completedChunks: 0
    });
  }
  
  // 청크 결과 수집
  collectChunkResult(jobId, chunkIndex, result) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.chunks[chunkIndex] = result;
    job.completedChunks++;
    
    // 진행 상황 이벤트 발생
    this.emit('progress', {
      jobId,
      progress: (job.completedChunks / job.totalChunks) * 100,
      completedChunks: job.completedChunks,
      totalChunks: job.totalChunks
    });
    
    // 모든 청크 완료 시
    if (job.completedChunks === job.totalChunks) {
      const finalResult = job.chunks.join(' ');
      this.emit('completed', { jobId, result: finalResult });
      this.jobs.delete(jobId); // 메모리 정리
    }
  }
  
  // 작업 실패 처리
  handleJobFailure(jobId, error) {
    this.emit('failed', { jobId, error });
    this.jobs.delete(jobId);
  }
}

module.exports = new TranscriptionCollector();
```

## 📋 **API 엔드포인트 개선**

### **1. 30분 제한 체크**
```javascript:/Users/hyemoonjung/backend_server/nodejs/backend_sayit/routes/transcribe.js
// 파일 길이 체크 함수
async function checkAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

// 업로드 엔드포인트에 제한 추가
router.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    const audioFile = req.file;
    if (!audioFile) {
      return res.status(400).json({ error: '오디오 파일이 필요합니다.' });
    }
    
    // 파일 길이 체크
    const duration = await checkAudioDuration(audioFile.path);
    const maxDuration = 30 * 60; // 30분
    
    if (duration > maxDuration) {
      // 임시 파일 삭제
      fs.unlinkSync(audioFile.path);
      
      return res.status(413).json({
        error: '파일이 너무 깁니다.',
        message: '30분 이하의 오디오 파일만 처리 가능합니다.',
        duration: Math.round(duration / 60),
        maxDuration: 30,
        premiumRequired: true
      });
    }
    
    // 큐 시스템으로 처리
    const { jobId } = await queueAudioTranscription(audioFile.path, req.body.language);
    
    res.json({
      success: true,
      jobId,
      message: '변환 작업이 큐에 등록되었습니다.',
      estimatedTime: Math.ceil(duration / 60 * 0.3) // 예상 처리 시간
    });
    
  } catch (error) {
    console.error('업로드 처리 실패:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});
```

### **2. 진행 상황 확인 API**
```javascript
// 작업 상태 확인
router.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    // 큐에서 작업 상태 확인
    const jobs = await transcriptionQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
    const jobStatus = jobs.filter(job => job.data.jobId === jobId);
    
    if (jobStatus.length === 0) {
      return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
    }
    
    const totalJobs = jobStatus.length;
    const completedJobs = jobStatus.filter(job => job.finishedOn).length;
    const failedJobs = jobStatus.filter(job => job.failedReason).length;
    
    res.json({
      jobId,
      status: completedJobs === totalJobs ? 'completed' : 'processing',
      progress: (completedJobs / totalJobs) * 100,
      totalChunks: totalJobs,
      completedChunks: completedJobs,
      failedChunks: failedJobs,
      estimatedTimeRemaining: (totalJobs - completedJobs) * 30 // 청크당 30초 예상
    });
    
  } catch (error) {
    res.status(500).json({ error: '상태 확인 실패' });
  }
});
```

## 🎯 **예상 성능 개선 효과**

### **단일 사용자**
```
기존: 10분 파일 → 2-4분 처리
개선: 10분 파일 → 5개 청크 병렬 → 1.5-3분 처리 (25% 향상)
```

### **다중 사용자 (3명 동시)**
```
기존: 총 10-20분 대기 (순차 처리)
개선: 총 4-8분 처리 (병렬 처리) → 60% 단축
```

### **시스템 안정성**
```
✅ 메모리 사용량 안정화 (청크별 처리)
✅ 장애 복구 능력 향상 (청크별 재시도)
✅ 사용자 경험 개선 (실시간 진행 상황)
```

**큐 시스템 도입으로 40-60%의 성능 향상과 안정성 확보가 가능합니다!** 🚀
