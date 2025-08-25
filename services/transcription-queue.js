const Queue = require('bull');
const redis = require('redis');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

// 🎯 컨테이너 식별 정보 (우선순위: 환경변수 → 호스트명)
const getContainerName = () => {
  // Docker Compose에서 설정한 컨테이너명 우선
  if (process.env.CONTAINER_NAME) {
    return process.env.CONTAINER_NAME;
  }
  
  // WORKER_ID 환경변수 확인
  if (process.env.WORKER_ID) {
    return process.env.WORKER_ID;
  }
  
  // 호스트명에서 컨테이너명 추출 시도
  const hostname = os.hostname();
  
  // Docker 컨테이너명 패턴 매칭
  if (hostname.includes('sayit-direct-backend')) {
    return 'Direct-Backend';
  } else if (hostname.includes('sayit-worker-1')) {
    return 'Worker-1';
  } else if (hostname.includes('sayit-worker-2')) {
    return 'Worker-2';
  } else if (hostname.includes('sayit-worker-3')) {
    return 'Worker-3';
  } else if (hostname.includes('direct')) {
    return 'Direct-Backend';
  } else if (hostname.includes('worker')) {
    return `Worker-${hostname.slice(-1)}`;
  }
  
  // 기본값
  return hostname.substring(0, 12); // 호스트명 앞 12자리
};

const CONTAINER_NAME = getContainerName();
const WORKER_MODE = process.env.WORKER_MODE || 'unknown';
const QUEUE_PROCESSING = process.env.QUEUE_PROCESSING !== 'false'; // ✅ 큐 처리 여부

console.log(`🏷️ 컨테이너 정보: ${CONTAINER_NAME} (모드: ${WORKER_MODE})`);
console.log(`🔍 원본 호스트명: ${os.hostname()}`);
console.log(`🔍 WORKER_ID: ${process.env.WORKER_ID || 'undefined'}`);
console.log(`🎯 큐 처리 활성화: ${QUEUE_PROCESSING ? '✅ YES' : '❌ NO'}`);

// Redis 연결 설정
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
};

console.log('🔗 Redis 연결 설정:', {
  host: redisConfig.host,
  port: redisConfig.port,
  hasPassword: !!redisConfig.password
});

// 변환 큐 생성
const transcriptionQueue = new Queue('audio transcription', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// 직접 Whisper 변환 함수 구현
async function transcribeChunkWithWhisper(chunkPath, jobId, chunkIndex, language) {
  return new Promise((resolve) => {
    console.log(`🎙️ [${CONTAINER_NAME}] Whisper 변환 시작 [${jobId}_chunk_${chunkIndex}]...`);
    console.log(`📁 [${CONTAINER_NAME}] 청크 파일: ${chunkPath}`);
    console.log(`🌐 [${CONTAINER_NAME}] 언어 설정: ${language}`);
    
    // 청크 파일과 같은 디렉토리에 결과 저장
    const chunkDir = path.dirname(chunkPath);
    
    const whisperArgs = [
      'whisper',
      chunkPath,
      '--model', 'base',
      '--output_format', 'txt',
      '--output_dir', chunkDir, // 청크 파일과 같은 디렉토리
      '--verbose', 'False',
    ];

    if (language !== 'auto') {
      whisperArgs.push('--language', language);
    }

    console.log(`🔧 [${CONTAINER_NAME}] Whisper 명령어: python3 -m ${whisperArgs.join(' ')}`);
    console.log(`📂 [${CONTAINER_NAME}] 출력 디렉토리: ${chunkDir}`);

    const whisper = spawn('python3', ['-m'].concat(whisperArgs));

    let outputData = '';
    let errorOutput = '';

    whisper.stdout.on('data', (data) => {
      outputData += data.toString();
      console.log(`📊 [${CONTAINER_NAME}] Whisper 출력: ${data.toString().trim()}`);
    });

    whisper.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log(`⚠️ [${CONTAINER_NAME}] Whisper 경고: ${data.toString().trim()}`);
    });

    whisper.on('close', async (code) => {
      console.log(`🎯 [${CONTAINER_NAME}] Whisper 프로세스 종료 [${jobId}_chunk_${chunkIndex}] 코드: ${code}`);

      if (code === 0) {
        try {
          // 결과 파일 경로 수정
          const chunkBasename = path.basename(chunkPath, path.extname(chunkPath));
          const outputFile = path.join(chunkDir, `${chunkBasename}.txt`);
          
          console.log(`📄 [${CONTAINER_NAME}] 결과 파일 경로: ${outputFile}`);
          
          const fs = require('fs').promises;
          
          // 파일 존재 확인
          try {
            await fs.access(outputFile);
            console.log(`✅ [${CONTAINER_NAME}] 결과 파일 존재 확인: ${outputFile}`);
          } catch (accessError) {
            console.log(`❌ [${CONTAINER_NAME}] 결과 파일 없음: ${outputFile}`);
            
            // 디렉토리 내 모든 파일 확인
            const files = await fs.readdir(chunkDir);
            console.log(`📋 [${CONTAINER_NAME}] 디렉토리 내 파일들: ${files.join(', ')}`);
            
            // .txt 파일 찾기
            const txtFiles = files.filter(f => f.endsWith('.txt'));
            if (txtFiles.length > 0) {
              const actualOutputFile = path.join(chunkDir, txtFiles[0]);
              console.log(`🔍 [${CONTAINER_NAME}] 실제 결과 파일: ${actualOutputFile}`);
              const transcript = await fs.readFile(actualOutputFile, 'utf8');
              
              console.log(`✅ [${CONTAINER_NAME}] 청크 변환 성공 [${jobId}_chunk_${chunkIndex}]`);
              console.log(`📝 [${CONTAINER_NAME}] 결과: ${transcript.trim().substring(0, 100)}...`);

              resolve({
                success: true,
                text: transcript.trim()
              });
              return;
            }
            
            throw new Error(`결과 파일을 찾을 수 없습니다: ${outputFile}`);
          }
          
          const transcript = await fs.readFile(outputFile, 'utf8');

          console.log(`✅ [${CONTAINER_NAME}] 청크 변환 성공 [${jobId}_chunk_${chunkIndex}]`);
          console.log(`📝 [${CONTAINER_NAME}] 결과: ${transcript.trim().substring(0, 100)}...`);

          resolve({
            success: true,
            text: transcript.trim()
          });
        } catch (error) {
          console.error(`❌ [${CONTAINER_NAME}] 결과 파일 읽기 실패 [${jobId}_chunk_${chunkIndex}]:`, error);
          resolve({
            success: false,
            error: error.message
          });
        }
      } else {
        console.error(`❌ [${CONTAINER_NAME}] Whisper 변환 실패 [${jobId}_chunk_${chunkIndex}]:`, errorOutput);
        resolve({
          success: false,
          error: `Whisper 프로세스 실패 (코드: ${code})`
        });
      }
    });

    whisper.on('error', (error) => {
      console.error(`💥 [${CONTAINER_NAME}] Whisper 프로세스 에러 [${jobId}_chunk_${chunkIndex}]:`, error);
      resolve({
        success: false,
        error: error.message
      });
    });
  });
}

// ✅ 큐 처리 함수 - 조건부 활성화
if (QUEUE_PROCESSING) {
  console.log(`🎯 [${CONTAINER_NAME}] 큐 처리 활성화 - Worker로 동작`);
  
  transcriptionQueue.process('chunk', 5, async (job) => {
    const { chunkPath, jobId, chunkIndex, totalChunks, language, outputDir } = job.data;
    
    console.log(`🎵 [${CONTAINER_NAME}] 청크 처리 시작 [${jobId}] ${chunkIndex + 1}/${totalChunks}`);
    console.log(`📁 [${CONTAINER_NAME}] 청크 파일: ${chunkPath}`);
    console.log(`🏷️ [${CONTAINER_NAME}] 처리 컨테이너: ${CONTAINER_NAME} (${WORKER_MODE})`);
    
    try {
      const result = await transcribeChunkWithWhisper(chunkPath, jobId, chunkIndex, language);
      
      if (!result.success) {
        throw new Error(result.error || '청크 변환 실패');
      }
      
      const progress = ((chunkIndex + 1) / totalChunks) * 100;
      job.progress(progress);
      
      console.log(`✅ [${CONTAINER_NAME}] 청크 처리 완료 [${jobId}] ${chunkIndex + 1}/${totalChunks} (${progress.toFixed(1)}%)`);
      console.log(`📝 [${CONTAINER_NAME}] 청크 결과: ${result.text?.substring(0, 100)}...`);
      
      // 🎯 Redis를 통한 결과 전달 (독립적으로 구현)
      await saveChunkResult(jobId, chunkIndex, result.text, CONTAINER_NAME);
      
      return {
        jobId,
        chunkIndex,
        totalChunks,
        result: result.text,
        processedBy: CONTAINER_NAME,
        workerMode: WORKER_MODE
      };
      
    } catch (error) {
      console.error(`❌ [${CONTAINER_NAME}] 청크 처리 실패 [${jobId}] ${chunkIndex + 1}/${totalChunks}:`, error);
      throw error;
    }
  });
  
  // 큐 이벤트 리스너
  transcriptionQueue.on('active', (job) => {
    console.log(`🏃 [${CONTAINER_NAME}] 작업 시작: ${job.id} [${job.data.jobId}] 청크 ${job.data.chunkIndex + 1}/${job.data.totalChunks}`);
  });

  transcriptionQueue.on('waiting', (jobId) => {
    console.log(`⏳ [${CONTAINER_NAME}] 작업 대기 중: ${jobId}`);
  });

  transcriptionQueue.on('completed', (job, result) => {
    console.log(`🎉 [${CONTAINER_NAME}] 청크 작업 완료: ${job.id} (처리자: ${result.processedBy})`);
  });

  transcriptionQueue.on('failed', (job, err) => {
    console.error(`💥 [${CONTAINER_NAME}] 청크 작업 실패: ${job.id}`, err.message);
  });

  transcriptionQueue.on('error', (error) => {
    console.error(`🚨 [${CONTAINER_NAME}] 큐 에러:`, error);
  });
  
} else {
  console.log(`🚫 [${CONTAINER_NAME}] 큐 처리 비활성화 - API 전용 모드`);
}

// Redis 결과 저장 함수 (컨테이너 정보 포함)
async function saveChunkResult(jobId, chunkIndex, result, containerName) {
  try {
    console.log(`📡 [${containerName}] Redis에 청크 결과 저장 [${jobId}] 청크 ${chunkIndex}`);
    
    const redisClient = redis.createClient({
      url: `redis://${redisConfig.host}:${redisConfig.port}`
    });
    
    await redisClient.connect();
    
    const resultData = {
      jobId,
      chunkIndex,
      result,
      timestamp: Date.now(),
      processedBy: containerName,
      workerMode: WORKER_MODE
    };
    
    const key = `completed:${jobId}:chunk:${chunkIndex}`;
    await redisClient.set(key, JSON.stringify(resultData), { EX: 3600 }); // 1시간 후 만료
    
    await redisClient.quit();
    
    console.log(`✅ [${containerName}] Redis 저장 완료: ${key}`);
    
  } catch (error) {
    console.error(`❌ [${containerName}] Redis 저장 실패:`, error);
    throw error;
  }
}

module.exports = transcriptionQueue; 