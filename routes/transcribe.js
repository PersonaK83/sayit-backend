const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

// ❌ 모든 외부 import 제거 (circular dependency 방지)
// const { queueAudioTranscription } = require('../services/audio-processor');
// const redisResultBridge = require('../services/redis-result-bridge');

const router = express.Router();

// ✅ 작업 상태 관리 (메모리 기반)
const transcriptionJobs = new Map();

// 작업 상태 enum
const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// 작업 정리 (24시간 후 자동 삭제)
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of transcriptionJobs.entries()) {
    if (now - job.createdAt > 24 * 60 * 60 * 1000) { // 24시간
      console.log(`🧹 만료된 작업 삭제: ${jobId}`);
      transcriptionJobs.delete(jobId);
    }
  }
}, 60 * 60 * 1000); // 1시간마다 정리

// 업로드 디렉토리 설정
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
fs.ensureDirSync(uploadDir);

// Multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname) || '.wav';
    cb(null, `audio-${uniqueSuffix}${extension}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav',
      'audio/wave', 'audio/webm', 'audio/aac', 'audio/x-aac',
      'audio/mp4a-latm', 'audio/ogg', 'audio/opus', 'audio/flac'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`지원하지 않는 파일 형식입니다: ${file.mimetype}`));
    }
  }
});

// 로컬 Whisper 설치 확인
function checkWhisperInstallation() {
  return new Promise((resolve) => {
    const python = spawn('python3', ['-c', 'import whisper; print("installed")']);

    python.on('close', (code) => {
      resolve(code === 0);
    });

    python.on('error', () => {
      resolve(false);
    });
  });
}

// ✅ 비동기 Whisper 변환 (자동 언어 감지 지원)
async function transcribeWithLocalWhisperAsync(audioFilePath, jobId, language = 'auto') {
  return new Promise((resolve) => {
    console.log(`🎙️ 비동기 Whisper 변환 시작 [${jobId}]...`);
    console.log('📁 파일 경로:', audioFilePath);
    console.log('🌐 언어 설정:', language);

    // 작업 상태 업데이트: 처리 중
    const job = transcriptionJobs.get(jobId);
    if (job) {
      job.status = JobStatus.PROCESSING;
      job.startedAt = Date.now();
      transcriptionJobs.set(jobId, job);
    }

    // Whisper 명령어 구성
    const whisperArgs = [
      audioFilePath,
      '--model', 'base',
      '--output_dir', path.dirname(audioFilePath),
      '--output_format', 'txt'
    ];

    if (language !== 'auto') {
      whisperArgs.push('--language', language);
    }

    console.log('🔧 Whisper 명령어:', 'whisper', whisperArgs.join(' '));

    const whisper = spawn('whisper', whisperArgs);

    let stdout = '';
    let stderr = '';

    whisper.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`Whisper 출력: ${data.toString().trim()}`);
    });

    whisper.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(`⚠️ Whisper 경고: ${data.toString().trim()}`);
    });

    whisper.on('close', async (code) => {
      console.log(`🎯 Whisper 변환 완료 [${jobId}], 종료 코드: ${code}`);

      if (code === 0) {
        try {
          // 결과 파일 읽기
          const outputFile = audioFilePath.replace(/\.[^/.]+$/, '.txt');
          const transcript = await fs.readFile(outputFile, 'utf8');

          // 작업 상태 업데이트: 완료
          if (job) {
            job.status = JobStatus.COMPLETED;
            job.completedAt = Date.now();
            job.transcript = transcript.trim();
            job.error = null;
            transcriptionJobs.set(jobId, job);
          }

          console.log(`✅ 변환 성공 [${jobId}]: ${transcript.trim().length}자`);
          resolve({ success: true, transcript: transcript.trim() });

        } catch (readError) {
          console.error(`❌ 결과 파일 읽기 실패 [${jobId}]:`, readError);
          
          if (job) {
            job.status = JobStatus.FAILED;
            job.completedAt = Date.now();
            job.error = '결과 파일 읽기 실패';
            transcriptionJobs.set(jobId, job);
          }
          
          resolve({ success: false, error: '결과 파일 읽기 실패' });
        }
      } else {
        console.error(`❌ Whisper 변환 실패 [${jobId}], 종료 코드: ${code}`);
        console.error('stderr:', stderr);
        
        if (job) {
          job.status = JobStatus.FAILED;
          job.completedAt = Date.now();
          job.error = `Whisper 변환 실패 (종료 코드: ${code})`;
          transcriptionJobs.set(jobId, job);
        }
        
        resolve({ success: false, error: `Whisper 변환 실패 (종료 코드: ${code})` });
      }
    });

    whisper.on('error', (error) => {
      console.error(`❌ Whisper 실행 오류 [${jobId}]:`, error);
      
      if (job) {
        job.status = JobStatus.FAILED;
        job.completedAt = Date.now();
        job.error = `Whisper 실행 오류: ${error.message}`;
        transcriptionJobs.set(jobId, job);
      }
      
      resolve({ success: false, error: `Whisper 실행 오류: ${error.message}` });
    });
  });
}

// 🎯 독립적인 Redis 폴링 시스템 (import 없이)
const redis = require('redis');

async function checkRedisResults() {
  try {
    console.log('🔍 Redis 폴링 실행 중...');
    
    const redisClient = redis.createClient({
      url: 'redis://sayit-redis-m2:6379'
    });
    
    await redisClient.connect();
    
    const completedKeys = await redisClient.keys('completed:*');
    console.log(`📋 Redis에서 발견된 완료 작업: ${completedKeys.length}개`);
    
    for (const key of completedKeys) {
      try {
        const resultData = await redisClient.get(key);
        if (resultData) {
          const data = JSON.parse(resultData);
          const { jobId, result } = data;
          
          const job = transcriptionJobs.get(jobId);
          if (job && job.status === JobStatus.PROCESSING) {
            job.status = JobStatus.COMPLETED;
            job.completedAt = Date.now();
            job.transcript = result;
            job.error = null;
            transcriptionJobs.set(jobId, job);
            
            console.log(`✅ Redis 폴링: 작업 완료 처리 [${jobId}]`);
            console.log(`📝 최종 결과: ${result}`);
          }
          
          // 처리된 키 삭제
          await redisClient.del(key);
        }
      } catch (parseError) {
        console.error('❌ Redis 결과 파싱 실패:', parseError);
      }
    }
    
    await redisClient.quit();
    
  } catch (error) {
    console.error('❌ Redis 결과 확인 실패:', error);
  }
}

// 5초마다 Redis 결과 확인
setInterval(checkRedisResults, 5000);
console.log('✅ Redis 폴링 시스템 시작 (5초 간격)');

// API 라우트들
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '오디오 파일이 필요합니다.' });
    }

    const audioFilePath = req.file.path;
    const originalFilename = req.file.originalname;
    const fileSize = req.file.size;
    const language = req.body.language || 'auto';
    
    //  파일 크기 기반 자동 판단 로직
    const fileSizeKB = fileSize / 1024;
    const shouldUseAsync = fileSizeKB > 100; // 100KB 초과시 비동기
    const async = req.body.async === 'true' || shouldUseAsync;

    console.log('📁 업로드된 파일:', originalFilename);
    console.log(' 파일 크기:', fileSize, 'bytes (', fileSizeKB.toFixed(1), 'KB)');
    console.log('🌐 언어 설정:', language);
    console.log('⚡ 처리 방식:', async ? '비동기' : '동기');
    console.log(' 자동 판단:', shouldUseAsync ? '파일 크기로 인한 비동기' : '요청에 따른 처리');

    // Whisper 설치 확인
    const whisperInstalled = await checkWhisperInstallation();
    if (!whisperInstalled) {
      return res.status(500).json({ 
        error: 'Whisper가 설치되지 않았습니다.',
        recommendation: 'pip3 install openai-whisper 명령어로 Whisper를 설치해주세요.'
      });
    }

    // 작업 ID 생성
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (async) {
      // 🔧 비동기 처리
      console.log(` 비동기 처리 시작 [${jobId}]`);
      
      // 작업 등록
      const job = {
        id: jobId,
        status: JobStatus.PENDING,
        originalFilename,
        fileSize,
        language,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        transcript: null,
        error: null
      };

      transcriptionJobs.set(jobId, job);
      console.log(` 작업 등록 완료 [${jobId}]: ${originalFilename}`);
      
      // 백그라운드에서 처리 시작 (await 없음)
      transcribeWithLocalWhisperAsync(audioFilePath, jobId, language);
      
      // 즉시 응답 (JobID + processing 상태)
      res.json({
        jobId,
        status: 'processing',
        message: '음성 변환이 시작되었습니다.',
        originalFilename,
        fileSize,
        reason: shouldUseAsync ? '파일 크기로 인한 자동 비동기 처리' : '사용자 요청에 따른 비동기 처리'
      });
      
    } else {
      // 🔧 동기 처리
      console.log(`⚡ 동기 처리 시작 [${jobId}]`);
      
      // 작업 등록 (동기 처리용)
      const job = {
        id: jobId,
        status: JobStatus.PROCESSING,
        originalFilename,
        fileSize,
        language,
        createdAt: Date.now(),
        startedAt: Date.now(),
        completedAt: null,
        transcript: null,
        error: null
      };

      transcriptionJobs.set(jobId, job);
      console.log(` 작업 등록 완료 [${jobId}]: ${originalFilename}`);
      
      // 동기적으로 변환 실행 (await 사용)
      const result = await transcribeWithLocalWhisperAsync(audioFilePath, jobId, language);
      
      if (result.success) {
        // 작업 상태 업데이트
        job.status = JobStatus.COMPLETED;
        job.completedAt = Date.now();
        job.transcript = result.transcript;
        transcriptionJobs.set(jobId, job);
        
        console.log(`✅ 동기 변환 완료 [${jobId}]: ${result.transcript.length}자`);
        
        res.json({
          jobId,
          status: 'completed',
          transcript: result.transcript,
          originalFilename,
          fileSize
        });
      } else {
        // 작업 상태 업데이트
        job.status = JobStatus.FAILED;
        job.completedAt = Date.now();
        job.error = result.error;
        transcriptionJobs.set(jobId, job);
        
        console.log(`❌ 동기 변환 실패 [${jobId}]: ${result.error}`);
        
        res.status(500).json({
          jobId,
          status: 'failed',
          error: result.error,
          originalFilename,
          fileSize
        });
      }
    }

  } catch (error) {
    console.error('❌ 변환 요청 처리 실패:', error);
    res.status(500).json({ error: '변환 요청 처리 실패' });
  }
});

// 작업 상태 확인
router.get('/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = transcriptionJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ 
        error: '작업을 찾을 수 없습니다.',
        jobId,
        code: 'JOB_NOT_FOUND'
      });
    }

    const response = {
      jobId: job.id,
      status: job.status,
      originalFilename: job.originalFilename,
      fileSize: job.fileSize,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt
    };

    if (job.status === JobStatus.COMPLETED) {
      response.transcript = job.transcript;
    } else if (job.status === JobStatus.FAILED) {
      response.error = job.error;
    } else if (job.status === JobStatus.PROCESSING) {
      // 진행률 계산 (임시)
      const progress = job.startedAt ? Math.min(0.9, (Date.now() - job.startedAt) / 30000) : 0;
      response.progress = progress;
    }

    res.json(response);

  } catch (error) {
    console.error('❌ 상태 확인 실패:', error);
    res.status(500).json({ error: '상태 확인 실패' });
  }
});

// 시스템 진단
router.get('/diagnose', async (req, res) => {
  try {
    const whisperInstalled = await checkWhisperInstallation();
    const activeJobs = Array.from(transcriptionJobs.values()).filter(job => 
      job.status === JobStatus.PROCESSING || job.status === JobStatus.PENDING
    ).length;

    res.json({
      status: 'OK',
      message: '로컬 STT 서비스가 정상 작동 중입니다.',
      timestamp: new Date().toISOString(),
      whisperInstalled,
      method: whisperInstalled ? 'Local Whisper' : 'Dummy Response',
      activeJobs,
      recommendation: whisperInstalled ? null : 'pip3 install openai-whisper 명령어로 Whisper를 설치해주세요.'
    });

  } catch (error) {
    console.error('❌ 진단 실패:', error);
    res.status(500).json({ error: '진단 실패' });
  }
});

// 헬스 체크
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
module.exports.transcribeWithLocalWhisperAsync = transcribeWithLocalWhisperAsync;