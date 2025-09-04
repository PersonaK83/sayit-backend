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

// ✅ 언어별 최적화 설정 함수 추가
function getLanguageOptimizedSettings(language) {
  const baseSettings = {
    model: 'small',
    task: 'transcribe',
    output_format: 'txt',
    verbose: 'False'
  };

  switch (language) {
    case 'ko': // 한국어 최적화
      return {
        ...baseSettings,
        language: 'ko',
        temperature: '0.2',        // 일관성 중시 (문법 복잡성)
        beam_size: '5',           // 다양한 후보 검토
        best_of: '3',            // 3번 시도 중 최고
        patience: '2.0',         // 충분한 디코딩 시간
        // 한국어 특화 설정
        suppress_tokens: '-1',   // 특수 토큰 억제 해제
        condition_on_previous_text: 'True', // 문맥 연결 강화
      };

    case 'en': // 영어 최적화
      return {
        ...baseSettings,
        language: 'en',
        temperature: '0.3',        // 약간 더 유연하게
        beam_size: '5',           
        best_of: '3',            
        patience: '1.5',         // 상대적으로 빠르게
        // 영어 특화 설정
        suppress_tokens: '-1',
        condition_on_previous_text: 'True',
      };

    case 'auto': // 자동 감지 (보수적 설정)
      return {
        ...baseSettings,
        temperature: '0.25',       // 중간값
        beam_size: '3',           // 보수적
        best_of: '2',
        patience: '1.8',
        // 언어 지정 안함 (자동 감지)
        suppress_tokens: '-1',
        condition_on_previous_text: 'True',
      };

    default: // 기본 설정
      return {
        ...baseSettings,
        language: language,
        temperature: '0.25',
        beam_size: '3',
        best_of: '2',
        patience: '1.8',
      };
  }
}

// 직접 Whisper 변환 함수 구현 (✅ 언어별 최적화 적용)
async function transcribeChunkWithWhisper(chunkPath, jobId, chunkIndex, language) {
  return new Promise((resolve) => {
    console.log(`🎙️ [${CONTAINER_NAME}] Whisper 변환 시작 [${jobId}_chunk_${chunkIndex}]...`);
    console.log(`📁 [${CONTAINER_NAME}] 청크 파일: ${chunkPath}`);
    console.log(`🌐 [${CONTAINER_NAME}] 언어 설정: ${language}`);
    
    // 청크 파일과 같은 디렉토리에 결과 저장
    const chunkDir = path.dirname(chunkPath);
    
    // ✅ 언어별 최적화 설정 적용
    const optimizedSettings = getLanguageOptimizedSettings(language);
    console.log(`🎯 [${CONTAINER_NAME}] ${language} 최적화 설정 적용:`, optimizedSettings);
    
    // ✅ 최적화된 whisper 인자 생성
    const whisperArgs = [
      'whisper',
      chunkPath,
      '--model', optimizedSettings.model,
      '--task', optimizedSettings.task,
      '--output_format', optimizedSettings.output_format,
      '--output_dir', chunkDir,
      '--verbose', optimizedSettings.verbose,
      '--temperature', optimizedSettings.temperature,
      '--beam_size', optimizedSettings.beam_size,
      '--best_of', optimizedSettings.best_of,
      '--patience', optimizedSettings.patience,
      '--suppress_tokens', optimizedSettings.suppress_tokens,
      '--condition_on_previous_text', optimizedSettings.condition_on_previous_text,
    ];

    // ✅ 언어별 조건부 설정
    if (optimizedSettings.language) {
      whisperArgs.push('--language', optimizedSettings.language);
    }

    console.log(`🔧 [${CONTAINER_NAME}] ${language} 최적화 명령어: python3 -m ${whisperArgs.join(' ')}`);
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
  
  // ✅ 환경변수 기반 동시성 설정 (NEW!)
  const maxConcurrency = parseInt(process.env.MAX_CONCURRENT_CHUNKS) || 5;
  console.log(`🎯 [${CONTAINER_NAME}] 큐 동시 처리 수: ${maxConcurrency}개`);
  console.log(`🎯 [${CONTAINER_NAME}] 메모리 제한: ${process.env.MEMORY_LIMIT || '4G'}`);
  
  // ✅ 하드코딩 5 → 환경변수 기반으로 변경
  transcriptionQueue.process('chunk', maxConcurrency, async (job) => {
    const { chunkPath, jobId, chunkIndex, totalChunks, language, outputDir } = job.data;
    
    console.log(`🎵 [${CONTAINER_NAME}] 청크 처리 시작 [${jobId}] ${chunkIndex + 1}/${totalChunks}`);
    console.log(`📁 [${CONTAINER_NAME}] 청크 파일: ${chunkPath}`);
    console.log(`🏷️ [${CONTAINER_NAME}] 처리 컨테이너: ${CONTAINER_NAME} (동시성: ${maxConcurrency})`);
    
    // ✅ 처리 시간 추적
    const startTime = Date.now();
    
    try {
      const result = await transcribeChunkWithWhisper(chunkPath, jobId, chunkIndex, language);
      
      if (!result.success) {
        throw new Error(result.error || '청크 변환 실패');
      }
      
      const progress = ((chunkIndex + 1) / totalChunks) * 100;
      const processingTime = (Date.now() - startTime) / 1000;
      job.progress(progress);
      
      console.log(`✅ [${CONTAINER_NAME}] 청크 처리 완료 [${jobId}] ${chunkIndex + 1}/${totalChunks} (${progress.toFixed(1)}%) 처리시간: ${processingTime.toFixed(1)}초`);
      console.log(`📝 [${CONTAINER_NAME}] 청크 결과: ${result.text?.substring(0, 100)}...`);
      
      // 🎯 Redis를 통한 결과 전달 (독립적으로 구현)
      await saveChunkResult(jobId, chunkIndex, result.text, CONTAINER_NAME);
      
      return {
        jobId,
        chunkIndex,
        totalChunks,
        result: result.text,
        processedBy: CONTAINER_NAME,
        workerMode: WORKER_MODE,
        processingTime: processingTime
      };
      
    } catch (error) {
      const processingTime = (Date.now() - startTime) / 1000;
      console.error(`❌ [${CONTAINER_NAME}] 청크 처리 실패 [${jobId}] ${chunkIndex + 1}/${totalChunks} (처리시간: ${processingTime.toFixed(1)}초):`, error);
      
      // ✅ 실패 청크 정보를 Redis에 저장 (디버깅용)
      await saveFailedChunkInfo(jobId, chunkIndex, error.message, CONTAINER_NAME);
      
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

// ✅ 실패한 청크 정보 저장 함수 (NEW!)
async function saveFailedChunkInfo(jobId, chunkIndex, errorMessage, containerName) {
  try {
    const redisClient = redis.createClient({
      url: `redis://${redisConfig.host}:${redisConfig.port}`
    });
    
    await redisClient.connect();
    
    const failedData = {
      jobId,
      chunkIndex, 
      errorMessage,
      timestamp: Date.now(),
      failedBy: containerName,
      retryable: true
    };
    
    const key = `failed:${jobId}:chunk:${chunkIndex}`;
    await redisClient.set(key, JSON.stringify(failedData), { EX: 7200 }); // 2시간 후 만료
    
    await redisClient.quit();
    
    console.log(`💥 [${containerName}] 실패 청크 정보 Redis 저장: ${key}`);
    
  } catch (error) {
    console.error(`❌ [${containerName}] 실패 정보 저장 실패:`, error);
  }
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