const Queue = require('bull');
const redis = require('redis');
const { spawn } = require('child_process');
const redisResultBridge = require('./redis-result-bridge');

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
    console.log(`🎙️ Whisper 변환 시작 [${jobId}_chunk_${chunkIndex}]...`);
    console.log('📁 청크 파일:', chunkPath);
    console.log('🌐 언어 설정:', language);
    
    const whisperArgs = [
      'whisper',
      chunkPath,
      '--model', 'base',
      '--output_format', 'txt',
      '--output_dir', '/app/temp',
      '--verbose', 'False',
      '--fp16', 'False',
      '--temperature', '0',
      '--best_of', '1'
    ];

    if (language && language !== 'auto') {
      whisperArgs.push('--language', language);
    }

    const whisper = spawn('python', ['-m', ...whisperArgs]);
    let output = '';
    let errorOutput = '';

    whisper.stdout.on('data', (data) => {
      output += data.toString();
    });

    whisper.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    whisper.on('close', (code) => {
      console.log(`🎯 Whisper 프로세스 종료 [${jobId}_chunk_${chunkIndex}] 코드: ${code}`);
      
      if (code === 0) {
        // 결과 파일 읽기 시도
        const fs = require('fs');
        const path = require('path');
        const outputFileName = path.basename(chunkPath, path.extname(chunkPath)) + '.txt';
        const outputPath = path.join('/app/temp', outputFileName);
        
        try {
          if (fs.existsSync(outputPath)) {
            const transcript = fs.readFileSync(outputPath, 'utf8').trim();
            console.log(`✅ 청크 변환 성공 [${jobId}_chunk_${chunkIndex}]`);
            console.log(`📝 결과: ${transcript.substring(0, 100)}...`);
            
            // 임시 파일 정리
            fs.unlinkSync(outputPath);
            
            resolve({
              success: true,
              text: transcript
            });
          } else {
            console.log(`⚠️ 결과 파일 없음 [${jobId}_chunk_${chunkIndex}]: ${outputPath}`);
            resolve({
              success: false,
              error: '결과 파일을 찾을 수 없습니다.'
            });
          }
        } catch (error) {
          console.error(`❌ 결과 파일 읽기 실패 [${jobId}_chunk_${chunkIndex}]:`, error);
          resolve({
            success: false,
            error: error.message
          });
        }
      } else {
        console.error(`❌ Whisper 변환 실패 [${jobId}_chunk_${chunkIndex}]:`, errorOutput);
        resolve({
          success: false,
          error: `Whisper 프로세스 실패 (코드: ${code})`
        });
      }
    });

    whisper.on('error', (error) => {
      console.error(`💥 Whisper 프로세스 에러 [${jobId}_chunk_${chunkIndex}]:`, error);
      resolve({
        success: false,
        error: error.message
      });
    });
  });
}

// 큐 처리 함수 수정
transcriptionQueue.process('chunk', 5, async (job) => {
  const { chunkPath, jobId, chunkIndex, totalChunks, language, outputDir } = job.data;
  
  console.log(`🎵 청크 처리 시작 [${jobId}] ${chunkIndex + 1}/${totalChunks}`);
  console.log(`📁 청크 파일: ${chunkPath}`);
  
  try {
    const result = await transcribeChunkWithWhisper(chunkPath, jobId, chunkIndex, language);
    
    if (!result.success) {
      throw new Error(result.error || '청크 변환 실패');
    }
    
    const progress = ((chunkIndex + 1) / totalChunks) * 100;
    job.progress(progress);
    
    console.log(`✅ 청크 처리 완료 [${jobId}] ${chunkIndex + 1}/${totalChunks} (${progress.toFixed(1)}%)`);
    console.log(`📝 청크 결과: ${result.text?.substring(0, 100)}...`);
    
    // 🎯 Redis를 통한 결과 전달 (기존 resultCollector 대체)
    const redisResultBridge = require('./redis-result-bridge');
    await redisResultBridge.saveChunkResult(jobId, chunkIndex, result.text);
    
    return {
      chunkIndex,
      result: result.text,
      success: true,
      jobId
    };
    
  } catch (error) {
    console.error(`❌ 청크 처리 실패 [${jobId}] ${chunkIndex + 1}/${totalChunks}:`, error.message);
    
    // 실패한 청크도 Redis로 전달
    await redisResultBridge.saveChunkResult(jobId, chunkIndex, `[청크 ${chunkIndex + 1} 처리 실패]`);
    
    throw error;
  }
});

// 큐 이벤트 리스너
transcriptionQueue.on('completed', (job, result) => {
  console.log(`🎉 청크 작업 완료: ${job.id}`);
});

transcriptionQueue.on('failed', (job, err) => {
  console.error(`💥 청크 작업 실패: ${job.id}`, err.message);
});

transcriptionQueue.on('stalled', (job) => {
  console.warn(`⏸️ 청크 작업 정체: ${job.id}`);
});

// 큐 상태 모니터링
transcriptionQueue.on('waiting', (jobId) => {
  console.log(`⏳ 작업 대기 중: ${jobId}`);
});

transcriptionQueue.on('active', (job, jobPromise) => {
  console.log(`🏃 작업 시작: ${job.id} [${job.data.jobId}] 청크 ${job.data.chunkIndex + 1}/${job.data.totalChunks}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 큐 시스템 종료 중...');
  await transcriptionQueue.close();
});

module.exports = transcriptionQueue; 