const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

// ✅ Redis 모듈 import 추가 (CRITICAL FIX!)
const redis = require('redis');

// ✅ 분산처리를 위한 audio-processor import 추가
const { queueAudioTranscription, cleanupTempFiles } = require('../services/audio-processor');

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

// ✅ 동기 전용 Whisper 변환 (분산처리 안 함)
async function transcribeWithLocalWhisperSync(audioFilePath, jobId, language = 'auto') {
  return new Promise((resolve) => {
    console.log(`🎙️ 동기 Whisper 변환 시작 [${jobId}]...`);
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
      console.log(`📊 Whisper 출력: ${data.toString().trim()}`);
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

          console.log(`✅ 동기 변환 성공 [${jobId}]: ${transcript.trim().length}자`);
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

// 파일 크기 기반 예상 시간 계산 (실제 데이터 기반)
function estimateDurationFromSize(fileSizeKB) {
  // 실제 측정: 2.1KB/초
  const ACTUAL_RATIO = 2.1; // KB per second
  return Math.ceil(fileSizeKB / ACTUAL_RATIO);
}

// 동적 청크 크기 계산 (audio-processor.js와 동일)
function calculateOptimalChunkDuration(estimatedDurationSeconds) {
  console.log(`📊 예상 파일 길이: ${estimatedDurationSeconds}초 (${(estimatedDurationSeconds/60).toFixed(1)}분)`);
  
  if (estimatedDurationSeconds <= 60) {        // 1분 이하
    console.log(`🎯 청크 전략: 짧은 파일 - 30초 청크`);
    return 30;  // 30초 청크 (2개 청크)
  } else if (estimatedDurationSeconds <= 300) { // 5분 이하 ✅
    console.log(`🎯 청크 전략: 보통 파일 - 60초 청크`);
    return 60;  // 1분 청크 (5개 청크) ✅
  } else if (estimatedDurationSeconds <= 900) { // 15분 이하 ✅
    console.log(`🎯 청크 전략: 긴 파일 - 90초 청크`);
    return 90;  // 1.5분 청크 (10개 청크)
  } else if (estimatedDurationSeconds <= 1800) { // 30분 이하 ✅ NEW!
    console.log(`🎯 청크 전략: 매우 긴 파일 - 120초 청크`);
    return 120; // 2분 청크 (15개 청크) ✅
  } else {                                      // 30분 초과 ✅ NEW!
    console.log(`🎯 청크 전략: 초장시간 파일 - 180초 청크`);
    return 180; // 3분 청크
  }
}

// ✅ 30분 대응: 청크 수 제한 해제
function estimateChunkCount(fileSize) {
  const fileSizeKB = fileSize / 1024;
  const estimatedDurationSeconds = estimateDurationFromSize(fileSizeKB);
  const chunkDurationSeconds = calculateOptimalChunkDuration(estimatedDurationSeconds);
  
  const estimatedChunks = Math.ceil(estimatedDurationSeconds / chunkDurationSeconds);
  
  // ✅ 30분 대응: 최대 제한을 10개 → 30개로 확장
  const maxChunks = 30; // 최대 30개 청크 (30분 × 2분청크 = 15개 여유)
  const finalChunks = Math.max(1, Math.min(maxChunks, estimatedChunks));
  
  console.log(`📊 청크 계산: ${estimatedDurationSeconds}초 → ${chunkDurationSeconds}초 청크 → ${estimatedChunks}개 → 제한적용 ${finalChunks}개`);
  
  return finalChunks;
}

// ✅ 30분 대응: 파일 크기 기준 조정
function shouldUseAsyncProcessing(fileSizeKB) {
  // 65KB 기준 (약 30초) → 30분 대응을 위해 유지
  return fileSizeKB > 65;
}

// ✅ 30분 대응: Redis 폴링 로직 개선
async function checkRedisResults() {
  try {
    console.log('🔍 [Direct-Backend] Redis 폴링 실행 중...');
    
    const redisClient = redis.createClient({
      url: 'redis://sayit-redis-m2:6379'
    });
    
    await redisClient.connect();
    
    // ✅ 완료된 청크와 실패한 청크 모두 확인
    const completedKeys = await redisClient.keys('completed:*:chunk:*');
    const failedKeys = await redisClient.keys('failed:*:chunk:*');
    
    console.log(`📋 [Direct-Backend] Redis 현황: 완료 ${completedKeys.length}개, 실패 ${failedKeys.length}개`);
    
    // JobId별로 청크들을 그룹화
    const jobChunks = {};
    const failedChunks = {};
    
    // 완료된 청크들 처리
    for (const key of completedKeys) {
      try {
        const resultData = await redisClient.get(key);
        if (resultData) {
          const data = JSON.parse(resultData);
          const { jobId, chunkIndex, result, processedBy, workerMode } = data;
          
          console.log(`📦 [Direct-Backend] 완료 청크: ${jobId} 청크 ${chunkIndex} (처리자: ${processedBy})`);
          
          if (!jobChunks[jobId]) {
            jobChunks[jobId] = [];
          }
          
          jobChunks[jobId].push({
            chunkIndex,
            result,
            processedBy,
            workerMode,
            key
          });
        }
      } catch (parseError) {
        console.error('❌ [Direct-Backend] Redis 완료 결과 파싱 실패:', parseError);
      }
    }
    
    // ✅ 실패한 청크들 처리 (NEW!)
    for (const key of failedKeys) {
      try {
        const failedData = await redisClient.get(key);
        if (failedData) {
          const data = JSON.parse(failedData);
          const { jobId, chunkIndex, errorMessage, failedBy } = data;
          
          console.log(`💥 [Direct-Backend] 실패 청크: ${jobId} 청크 ${chunkIndex} (실패자: ${failedBy}) - ${errorMessage}`);
          
          if (!failedChunks[jobId]) {
            failedChunks[jobId] = [];
          }
          
          failedChunks[jobId].push({
            chunkIndex,
            errorMessage,
            failedBy,
            key
          });
        }
      } catch (parseError) {
        console.error('❌ [Direct-Backend] Redis 실패 결과 파싱 실패:', parseError);
      }
    }
    
    // 완료된 작업들 처리
    for (const [jobId, chunks] of Object.entries(jobChunks)) {
      const job = transcriptionJobs.get(jobId);
      if (job && job.status === JobStatus.PROCESSING) {
        
        // ✅ 실패한 청크도 고려한 완료 확인
        const failedChunksForJob = failedChunks[jobId] || [];
        const totalProcessedChunks = chunks.length + failedChunksForJob.length;
        
        console.log(`🔍 [Direct-Backend] 작업 [${jobId}] 청크 상태 확인:`);
        console.log(`   📊 완료된 청크: ${chunks.length}개`);
        console.log(`   💥 실패한 청크: ${failedChunksForJob.length}개`);
        console.log(`   📊 총 처리된 청크: ${totalProcessedChunks}개`);
        
        // 예상 청크 수 확인
        const expectedChunks = job.expectedChunks || estimateChunkCount(job.fileSize);
        console.log(`   📊 예상 청크 수: ${expectedChunks}개`);
        
        // ✅ 30분 대응: 모든 청크가 완료되었는지 확인 (실패 포함)
        if (totalProcessedChunks >= expectedChunks) {
          console.log(`🎯 [Direct-Backend] 모든 청크 처리 완료! 취합 시작 [${jobId}]`);
          
          // 청크를 인덱스 순서대로 정렬
          const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
          
          // ✅ 실패한 청크는 빈 문자열로 처리 (연속성 보장)
          const allChunks = [];
          for (let i = 0; i < expectedChunks; i++) {
            const chunk = sortedChunks.find(c => c.chunkIndex === i);
            if (chunk) {
              allChunks.push(chunk.result || '');
            } else {
              // 실패한 청크 확인
              const failedChunk = failedChunksForJob.find(f => f.chunkIndex === i);
              if (failedChunk) {
                console.warn(`⚠️ [Direct-Backend] 청크 ${i} 실패로 인한 빈 구간: ${failedChunk.errorMessage}`);
                allChunks.push(''); // 빈 문자열로 처리
              } else {
                console.warn(`⚠️ [Direct-Backend] 청크 ${i} 누락됨`);
                allChunks.push('');
              }
            }
          }
          
          // 모든 청크 결과를 순서대로 결합 (빈 구간 제외)
          const finalResult = allChunks.filter(chunk => chunk.trim() !== '').join(' ');
          
          // 처리한 컨테이너 목록
          const processedByList = [...new Set(sortedChunks.map(chunk => chunk.processedBy))];
          const successRate = (sortedChunks.length / expectedChunks * 100).toFixed(1);
          
          job.status = JobStatus.COMPLETED;
          job.completedAt = Date.now();
          job.transcript = finalResult;
          job.error = failedChunksForJob.length > 0 ? `일부 청크 실패 (${failedChunksForJob.length}/${expectedChunks}개)` : null;
          job.successRate = successRate;
          transcriptionJobs.set(jobId, job);
          
          console.log(`✅ [Direct-Backend] 작업 완료 처리 [${jobId}]`);
          console.log(`📝 [Direct-Backend] 최종 결과: ${finalResult.substring(0, 100)}... (${finalResult.length}자)`);
          console.log(`🏷️ [Direct-Backend] 처리 컨테이너들: ${processedByList.join(', ')}`);
          console.log(`📊 [Direct-Backend] 성공률: ${successRate}% (${sortedChunks.length}/${expectedChunks})`);
          
          // ✅ 처리된 키들과 실패 키들 모두 삭제
          for (const chunk of chunks) {
            await redisClient.del(chunk.key);
          }
          for (const failed of failedChunksForJob) {
            await redisClient.del(failed.key);
          }
          
        } else {
          console.log(`⏳ [Direct-Backend] 작업 [${jobId}] 대기 중: ${totalProcessedChunks}/${expectedChunks} 청크 처리됨`);
          
          // ✅ 상세한 진행 상황 출력
          const completedIndices = chunks.map(c => c.chunkIndex).sort((a, b) => a - b);
          const failedIndices = failedChunksForJob.map(f => f.chunkIndex).sort((a, b) => a - b);
          const allIndices = Array.from({length: expectedChunks}, (_, i) => i);
          const pendingIndices = allIndices.filter(i => 
            !completedIndices.includes(i) && !failedIndices.includes(i)
          );
          
          console.log(`   📋 완료된 청크: [${completedIndices.join(', ')}]`);
          if (failedIndices.length > 0) {
            console.log(`   💥 실패한 청크: [${failedIndices.join(', ')}]`);
          }
          console.log(`   ⏳ 대기 중인 청크: [${pendingIndices.join(', ')}]`);
          
          // ✅ 30분 대응: 장시간 대기 시 타임아웃 체크
          const jobAge = Date.now() - job.createdAt;
          if (jobAge > 600000) { // 10분 초과 대기
            console.warn(`⚠️ [Direct-Backend] 작업 [${jobId}] 장시간 대기 (${Math.floor(jobAge/60000)}분)`);
          }
        }
      }
    }
    
    await redisClient.quit();
    
  } catch (error) {
    console.error('❌ [Direct-Backend] Redis 결과 확인 실패:', error);
  }
}

// ✅ 30분 대응: 폴링 간격 최적화 (5초 → 3초)
setInterval(checkRedisResults, 3000);
console.log('✅ Redis 폴링 시스템 시작 (3초 간격)');

// ✅ 개별 작업 처리 함수 (파일 정리 추가)
async function processJobChunks(jobId, chunks, redisClient) {
  try {
    const job = transcriptionJobs.get(jobId);
    
    // ✅ 이미 완료된 작업은 건너뛰기 (중복 처리 방지)
    if (!job || job.status !== JobStatus.PROCESSING) {
      console.log(`⏭️ [Direct-Backend] 작업 [${jobId}] 건너뛰기: ${job ? job.status : '작업 없음'}`);
      return;
    }
    
    console.log(`🔍 [Direct-Backend] 작업 [${jobId}] 청크 상태 확인:`);
    console.log(`   📊 완료된 청크: ${chunks.length}개`);
    
    // 예상 청크 수 확인
    const expectedChunks = job.expectedChunks || estimateChunkCount(job.fileSize);
    console.log(`   📊 예상 청크 수: ${expectedChunks}개`);
    
    // ✅ 중복 청크 제거
    const uniqueChunks = [];
    const seenIndices = new Set();
    
    for (const chunk of chunks) {
      if (!seenIndices.has(chunk.chunkIndex)) {
        uniqueChunks.push(chunk);
        seenIndices.add(chunk.chunkIndex);
      } else {
        console.log(`⚠️ [Direct-Backend] 중복 청크 발견: ${jobId} 청크 ${chunk.chunkIndex}`);
      }
    }
    
    console.log(`   📊 고유 청크: ${uniqueChunks.length}개`);
    
    // ✅ 모든 청크가 완료되었는지 확인
    if (uniqueChunks.length >= expectedChunks) {
      console.log(`🎯 [Direct-Backend] 모든 청크 완료! 취합 시작 [${jobId}]`);
      
      // ✅ 원자적 작업 상태 변경 (Race Condition 방지)
      if (job.status !== JobStatus.PROCESSING) {
        console.log(`⚠️ [Direct-Backend] 작업 [${jobId}] 이미 처리됨: ${job.status}`);
        return;
      }
      
      // 청크를 인덱스 순서대로 정렬
      const sortedChunks = uniqueChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      
      // 모든 청크 결과를 순서대로 결합
      const finalResult = sortedChunks.map(chunk => chunk.result).join(' ');
      
      // 처리한 컨테이너 목록
      const processedByList = [...new Set(sortedChunks.map(chunk => chunk.processedBy))];
      
      // ✅ 원자적 상태 업데이트
      job.status = JobStatus.COMPLETED;
      job.completedAt = Date.now();
      job.transcript = finalResult;
      job.error = null;
      transcriptionJobs.set(jobId, job);
      
      console.log(`✅ [Direct-Backend] 작업 완료 처리 [${jobId}]`);
      console.log(`📝 [Direct-Backend] 최종 결과: ${finalResult.substring(0, 100)}...`);
      console.log(`🏷️ [Direct-Backend] 처리 컨테이너들: ${processedByList.join(', ')}`);
      console.log(`📊 [Direct-Backend] 청크별 처리자:`);
      
      sortedChunks.forEach((chunk) => {
        console.log(`   청크 ${chunk.chunkIndex}: ${chunk.processedBy}`);
      });
      
      // ✅ 처리된 키들 안전하게 삭제
      const deletedKeys = [];
      for (const chunk of chunks) {
        try {
          const deleted = await redisClient.del(chunk.key);
          if (deleted) {
            deletedKeys.push(chunk.key);
          }
        } catch (delError) {
          console.error(`❌ [Direct-Backend] 키 삭제 실패: ${chunk.key}`, delError);
        }
      }
      
      console.log(`🗑️ [Direct-Backend] 삭제된 키: ${deletedKeys.length}개`);
      
      // ✅ 임시 파일 정리 (비동기로 실행)
      setTimeout(async () => {
        try {
          const tempDir = `/app/temp/${jobId}`;
          await cleanupTempFiles(tempDir);
          console.log(`🧹 [Direct-Backend] 임시 파일 정리 완료 [${jobId}]`);
        } catch (cleanupError) {
          console.error(`❌ [Direct-Backend] 임시 파일 정리 실패 [${jobId}]:`, cleanupError);
        }
      }, 5000); // 5초 후 정리 (결과 전송 후)
      
    } else {
      console.log(`⏳ [Direct-Backend] 작업 [${jobId}] 대기 중: ${uniqueChunks.length}/${expectedChunks} 청크 완료`);
      
      // 완료된 청크 목록 출력
      const completedIndices = uniqueChunks.map(c => c.chunkIndex).sort((a, b) => a - b);
      console.log(`   📋 완료된 청크: [${completedIndices.join(', ')}]`);
      
      // 대기 중인 청크 목록
      const allIndices = Array.from({length: expectedChunks}, (_, i) => i);
      const pendingIndices = allIndices.filter(i => !completedIndices.includes(i));
      console.log(`   ⏳ 대기 중인 청크: [${pendingIndices.join(', ')}]`);
    }
    
  } catch (error) {
    console.error(`❌ [Direct-Backend] 작업 [${jobId}] 처리 실패:`, error);
  }
}

// ✅ 업로드 파일 정리 함수
async function cleanupUploadFile(filePath) {
  try {
    console.log(`🧹 [Direct-Backend] 업로드 파일 정리: ${filePath}`);
    await fs.unlink(filePath);
    console.log(`✅ [Direct-Backend] 업로드 파일 정리 완료: ${filePath}`);
  } catch (error) {
    console.error(`❌ [Direct-Backend] 업로드 파일 정리 실패: ${filePath}`, error);
  }
}

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
    
    // 🔧 파일 크기 기반 자동 판단 로직
    const fileSizeKB = fileSize / 1024;
    const estimatedDuration = estimateDurationFromSize(fileSizeKB);

    // 작업 ID 생성
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 30초 기준으로 동기/비동기 결정
    const shouldUseAsync = estimatedDuration > 30 || req.body.async === 'true';

    if (shouldUseAsync) {
      // 비동기 처리 로직
      console.log(`🔄 비동기 처리 시작 [${jobId}] - 예상 ${estimatedDuration}초`);
    } else {
      // 동기 처리 로직
      console.log(`⚡ 동기 처리 시작 [${jobId}] - 예상 ${estimatedDuration}초`);
    }

    // Whisper 설치 확인
    const whisperInstalled = await checkWhisperInstallation();
    if (!whisperInstalled) {
      return res.status(500).json({ 
        error: 'Whisper가 설치되지 않았습니다.',
        recommendation: 'pip3 install openai-whisper 명령어로 Whisper를 설치해주세요.'
      });
    }

    

    if (shouldUseAsync) {
      // 🔧 분산처리 (큐 시스템 사용)
      console.log(`🔄 분산처리 시작 [${jobId}]`);
      
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
        error: null,
        expectedChunks: null,
        uploadFilePath: audioFilePath // ✅ 업로드 파일 경로 저장
      };

      transcriptionJobs.set(jobId, job);
      console.log(`📝 작업 등록 완료 [${jobId}]: ${originalFilename}`);
      
      // ✅ 분산처리: 큐에 등록 (JobId 전달)
      try {
        console.log(`📤 큐 등록 시작 [${jobId}]`);
        const queueResult = await queueAudioTranscription(audioFilePath, jobId, language);
        console.log(`📤 큐 등록 완료 [${jobId}] - Worker들이 처리 시작`);
        
        // ✅ 실제 청크 수를 작업에 저장
        job.expectedChunks = queueResult.chunkCount;
        job.status = JobStatus.PROCESSING;
        job.startedAt = Date.now();
        transcriptionJobs.set(jobId, job);
        
        console.log(`📊 [Direct-Backend] 예상 청크 수: ${queueResult.chunkCount}개`);
        
        // ✅ 업로드 파일 정리 예약 (30분 후)
        setTimeout(async () => {
          await cleanupUploadFile(audioFilePath);
        }, 30 * 60 * 1000); // 30분 후
        
      } catch (error) {
        console.error(`❌ 큐 등록 실패 [${jobId}]:`, error);
        job.status = JobStatus.FAILED;
        job.error = '큐 등록 실패';
        transcriptionJobs.set(jobId, job);
        
        // ✅ 실패 시 즉시 업로드 파일 정리
        setTimeout(async () => {
          await cleanupUploadFile(audioFilePath);
        }, 5000); // 5초 후
      }
      
      // 즉시 응답 (JobID + processing 상태)
      res.json({
        jobId,
        status: 'processing',
        message: '음성 변환이 시작되었습니다.',
        originalFilename,
        fileSize,
        reason: shouldUseAsync ? '파일 크기로 인한 자동 분산처리' : '사용자 요청에 따른 분산처리'
      });
      
    } else {
      // 🔧 동기 처리 (Direct Backend에서 직접 처리)
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
      console.log(`📝 작업 등록 완료 [${jobId}]: ${originalFilename}`);
      
      // 동기적으로 변환 실행 (await 사용)
      const result = await transcribeWithLocalWhisperSync(audioFilePath, jobId, language);
      
      if (result.success) {
        // 작업 상태 업데이트
        job.status = JobStatus.COMPLETED;
        job.completedAt = Date.now();
        job.transcript = result.transcript;
        transcriptionJobs.set(jobId, job);
        
        console.log(`✅ 동기 변환 완료 [${jobId}]: ${result.transcript.length}자`);
        
        // ✅ 동기 처리 응답: jobId 제거하고 success 추가
        res.json({
          success: true,
          status: 'completed',
          transcript: result.transcript,
          originalFilename,
          fileSize,
          processingTime: Date.now() - job.startedAt
        });
      } else {
        // 작업 상태 업데이트
        job.status = JobStatus.FAILED;
        job.completedAt = Date.now();
        job.error = result.error;
        transcriptionJobs.set(jobId, job);
        
        console.log(`❌ 동기 변환 실패 [${jobId}]: ${result.error}`);
        
        // ✅ 동기 처리 실패 응답: jobId 제거하고 success 추가
        res.status(500).json({
          success: false,
          status: 'failed',
          error: result.error,
          originalFilename,
          fileSize
        });
      }

      // ✅ 동기 처리 완료 후 파일 정리
      setTimeout(async () => {
        await cleanupUploadFile(audioFilePath);
      }, 10000); // 10초 후
    }

  } catch (error) {
    console.error('❌ 변환 요청 처리 실패:', error);
    res.status(500).json({ error: '변환 요청 처리 실패' });
  }
});

// ✅ 작업 상태 확인 API (중요!)
router.get('/transcribe/status/:jobId', (req, res) => {
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
      message: '분산 STT 서비스가 정상 작동 중입니다.',
      timestamp: new Date().toISOString(),
      whisperInstalled,
      method: whisperInstalled ? 'Distributed Processing' : 'Dummy Response',
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

// ✅ 30분 대응: 워커 상태 및 큐 모니터링 API 추가
router.get('/workers/status', async (req, res) => {
  try {
    const transcriptionQueue = require('../services/transcription-queue');
    
    const waiting = await transcriptionQueue.getWaiting();
    const active = await transcriptionQueue.getActive();
    const completed = await transcriptionQueue.getCompleted();
    const failed = await transcriptionQueue.getFailed();
    
    // 활성 작업들의 상세 정보
    const activeDetails = active.map(job => ({
      id: job.id,
      jobId: job.data.jobId,
      chunkIndex: job.data.chunkIndex,
      totalChunks: job.data.totalChunks,
      language: job.data.language,
      progress: job.progress(),
      startedAt: job.processedOn,
      worker: job.opts.worker || 'unknown'
    }));
    
    // 실패한 작업들의 상세 정보
    const failedDetails = failed.map(job => ({
      id: job.id,
      jobId: job.data.jobId,
      chunkIndex: job.data.chunkIndex,
      error: job.failedReason,
      attempts: job.attemptsMade,
      failedAt: job.failedOn
    }));
    
    res.json({
      timestamp: new Date().toISOString(),
      queue: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      },
      activeJobs: activeDetails,
      failedJobs: failedDetails,
      systemInfo: {
        containerName: process.env.CONTAINER_NAME || 'unknown',
        workerMode: process.env.WORKER_MODE || 'unknown',
        maxConcurrency: process.env.MAX_CONCURRENT_CHUNKS || 'unknown',
        queueProcessing: process.env.QUEUE_PROCESSING !== 'false'
      }
    });
    
  } catch (error) {
    console.error('❌ 워커 상태 확인 실패:', error);
    res.status(500).json({ error: '워커 상태 확인 실패' });
  }
});

// ✅ 30분 대응: 특정 작업의 상세 진행 상황 API
router.get('/transcribe/:jobId/detailed-status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = transcriptionJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ 
        error: '작업을 찾을 수 없습니다.',
        jobId
      });
    }

    // Redis에서 실시간 청크 상태 확인
    const redisClient = redis.createClient({
      url: 'redis://sayit-redis-m2:6379'
    });
    
    await redisClient.connect();
    
    const completedKeys = await redisClient.keys(`completed:${jobId}:chunk:*`);
    const failedKeys = await redisClient.keys(`failed:${jobId}:chunk:*`);
    
    const chunkStatus = [];
    const expectedChunks = job.expectedChunks || estimateChunkCount(job.fileSize);
    
    // 각 청크별 상태 확인
    for (let i = 0; i < expectedChunks; i++) {
      const completedKey = `completed:${jobId}:chunk:${i}`;
      const failedKey = `failed:${jobId}:chunk:${i}`;
      
      if (completedKeys.some(key => key === completedKey)) {
        const data = JSON.parse(await redisClient.get(completedKey));
        chunkStatus.push({
          chunkIndex: i,
          status: 'completed',
          processedBy: data.processedBy,
          completedAt: data.timestamp
        });
      } else if (failedKeys.some(key => key === failedKey)) {
        const data = JSON.parse(await redisClient.get(failedKey));
        chunkStatus.push({
          chunkIndex: i,
          status: 'failed',
          failedBy: data.failedBy,
          error: data.errorMessage,
          failedAt: data.timestamp
        });
      } else {
        chunkStatus.push({
          chunkIndex: i,
          status: 'pending'
        });
      }
    }
    
    await redisClient.quit();

    const response = {
      jobId: job.id,
      status: job.status,
      originalFilename: job.originalFilename,
      fileSize: job.fileSize,
      expectedChunks: expectedChunks,
      completedChunks: chunkStatus.filter(c => c.status === 'completed').length,
      failedChunks: chunkStatus.filter(c => c.status === 'failed').length,
      pendingChunks: chunkStatus.filter(c => c.status === 'pending').length,
      chunkDetails: chunkStatus,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      processingTime: job.completedAt ? job.completedAt - job.createdAt : Date.now() - job.createdAt
    };

    if (job.status === JobStatus.COMPLETED) {
      response.transcript = job.transcript;
      response.successRate = job.successRate;
    } else if (job.status === JobStatus.FAILED) {
      response.error = job.error;
    }

    res.json(response);

  } catch (error) {
    console.error('❌ 상세 상태 확인 실패:', error);
    res.status(500).json({ error: '상세 상태 확인 실패' });
  }
});




// ✅ 정기적 파일 정리 (1시간마다)
setInterval(async () => {
  try {
    console.log('🧹 [Direct-Backend] 정기 파일 정리 시작...');
    
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // 1시간 이상 된 temp 디렉토리 정리
    const tempBaseDir = '/app/temp';
    const tempDirs = await fs.readdir(tempBaseDir).catch(() => []);
    
    for (const dir of tempDirs) {
      if (dir.startsWith('job_')) {
        const dirPath = path.join(tempBaseDir, dir);
        const stats = await fs.stat(dirPath).catch(() => null);
        
        if (stats && stats.mtime.getTime() < oneHourAgo) {
          console.log(`🧹 [Direct-Backend] 오래된 temp 디렉토리 정리: ${dir}`);
          await cleanupTempFiles(dirPath);
        }
      }
    }
    
    // 1시간 이상 된 업로드 파일 정리
    const uploadDir = '/app/uploads';
    const uploadFiles = await fs.readdir(uploadDir).catch(() => []);
    
    for (const file of uploadFiles) {
      if (file.startsWith('audio-')) {
        const filePath = path.join(uploadDir, file);
        const stats = await fs.stat(filePath).catch(() => null);
        
        if (stats && stats.mtime.getTime() < oneHourAgo) {
          console.log(`🧹 [Direct-Backend] 오래된 업로드 파일 정리: ${file}`);
          await fs.unlink(filePath).catch(console.error);
        }
      }
    }
    
    console.log('✅ [Direct-Backend] 정기 파일 정리 완료');
    
  } catch (error) {
    console.error('❌ [Direct-Backend] 정기 파일 정리 실패:', error);
  }
}, 60 * 60 * 1000); // 1시간마다

console.log('✅ 정기 파일 정리 시스템 시작 (1시간 간격)');

module.exports = router;