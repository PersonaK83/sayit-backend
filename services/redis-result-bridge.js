const redis = require('redis');
const EventEmitter = require('events');

class RedisResultBridge extends EventEmitter {
  constructor() {
    super();
    this.redisClient = null;
    this.subscriber = null;
    this.jobs = new Map();
    this.connect();
  }

  async connect() {
    try {
      // Redis 클라이언트 생성
      this.redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'sayit-redis-m2',
        port: process.env.REDIS_PORT || 6379
      });

      // 구독용 클라이언트 생성
      this.subscriber = redis.createClient({
        host: process.env.REDIS_HOST || 'sayit-redis-m2',
        port: process.env.REDIS_PORT || 6379
      });

      await this.redisClient.connect();
      await this.subscriber.connect();

      // 결과 채널 구독
      await this.subscriber.subscribe('chunk-results', (message) => {
        this.handleChunkResult(JSON.parse(message));
      });

      console.log('✅ Redis Result Bridge 연결 성공');
    } catch (error) {
      console.error('❌ Redis Result Bridge 연결 실패:', error);
    }
  }

  // 작업 등록
  registerJob(jobId, totalChunks) {
    this.jobs.set(jobId, {
      chunks: new Array(totalChunks).fill(null),
      totalChunks,
      completedChunks: 0,
      createdAt: Date.now()
    });
    console.log(`📋 작업 등록 [${jobId}]: ${totalChunks}개 청크`);
  }

  // 워커에서 호출: 청크 결과를 Redis로 전송
  async sendChunkResult(jobId, chunkIndex, result) {
    try {
      const message = {
        jobId,
        chunkIndex,
        result,
        timestamp: Date.now()
      };

      await this.redisClient.publish('chunk-results', JSON.stringify(message));
      console.log(`📡 청크 결과 전송 [${jobId}] 청크 ${chunkIndex}: ${result?.substring(0, 50)}...`);
    } catch (error) {
      console.error(`❌ 청크 결과 전송 실패 [${jobId}]:`, error);
    }
  }

  // Direct Backend에서 수신: Redis에서 받은 청크 결과 처리
  handleChunkResult(message) {
    const { jobId, chunkIndex, result } = message;
    const job = this.jobs.get(jobId);

    if (!job) {
      console.warn(`⚠️ 알 수 없는 작업 ID: ${jobId}`);
      return;
    }

    console.log(`📥 청크 결과 수신 [${jobId}] 청크 ${chunkIndex}`);

    job.chunks[chunkIndex] = result;
    job.completedChunks++;

    const progress = (job.completedChunks / job.totalChunks) * 100;

    // 진행 상황 이벤트
    this.emit('progress', {
      jobId,
      progress,
      completedChunks: job.completedChunks,
      totalChunks: job.totalChunks,
      status: 'processing'
    });

    // 모든 청크 완료 시
    if (job.completedChunks === job.totalChunks) {
      console.log(`🎉 모든 청크 완료 [${jobId}], 결과 병합 중...`);

      const validChunks = job.chunks.filter(chunk => chunk !== null && chunk.trim() !== '');
      const finalResult = validChunks.join(' ').trim();

      console.log(`✅ 최종 결과 생성 [${jobId}]: ${finalResult.length}자`);

      this.emit('completed', {
        jobId,
        result: finalResult,
        totalChunks: job.totalChunks,
        processingTime: Date.now() - job.createdAt
      });

      // 메모리 정리
      this.jobs.delete(jobId);
    }
  }

  // 정리
  async disconnect() {
    if (this.redisClient) await this.redisClient.quit();
    if (this.subscriber) await this.subscriber.quit();
  }
}

module.exports = new RedisResultBridge(); 