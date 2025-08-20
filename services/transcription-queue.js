const Queue = require('bull');
const redis = require('redis');
const { transcribeWithLocalWhisperAsync } = require('../routes/transcribe');
const resultCollector = require('./result-collector');

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
    removeOnComplete: 10,  // 완료된 작업 10개만 보관
    removeOnFail: 50,      // 실패한 작업 50개 보관
    attempts: 3,           // 최대 3번 재시도
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// 청크 처리 작업 정의 (동시 5개 청크 처리)
transcriptionQueue.process('chunk', 5, async (job) => {
  const { chunkPath, jobId, chunkIndex, totalChunks, language, outputDir } = job.data;
  
  console.log(`🎵 청크 처리 시작 [${jobId}] ${chunkIndex + 1}/${totalChunks}`);
  console.log(`📁 청크 파일: ${chunkPath}`);
  
  try {
    // 청크 변환 처리 (기존 Whisper 함수 재사용)
    const result = await transcribeWithLocalWhisperAsync(chunkPath, `${jobId}_chunk_${chunkIndex}`, language);
    
    if (!result.success) {
      throw new Error(result.error || '청크 변환 실패');
    }
    
    // 진행 상황 업데이트
    const progress = ((chunkIndex + 1) / totalChunks) * 100;
    job.progress(progress);
    
    console.log(`✅ 청크 처리 완료 [${jobId}] ${chunkIndex + 1}/${totalChunks} (${progress.toFixed(1)}%)`);
    console.log(`📝 청크 결과: ${result.text?.substring(0, 100)}...`);
    
    // 결과 수집기에 전달
    resultCollector.collectChunkResult(jobId, chunkIndex, result.text);
    
    return {
      chunkIndex,
      result: result.text,
      success: true,
      jobId
    };
    
  } catch (error) {
    console.error(`❌ 청크 처리 실패 [${jobId}] ${chunkIndex + 1}/${totalChunks}:`, error.message);
    
    // 실패한 청크도 결과 수집기에 알림 (빈 텍스트로)
    resultCollector.collectChunkResult(jobId, chunkIndex, `[청크 ${chunkIndex + 1} 처리 실패]`);
    
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