const redis = require('redis');

class RedisResultBridge {
  constructor() {
    this.redisClient = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    
    try {
      this.redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'sayit-redis-m2',
        port: process.env.REDIS_PORT || 6379
      });

      await this.redisClient.connect();
      this.connected = true;
      console.log('✅ Redis Result Bridge 연결 성공');
    } catch (error) {
      console.error('❌ Redis Result Bridge 연결 실패:', error);
      this.connected = false;
    }
  }

  // 워커에서 호출: 청크 결과를 Redis에 저장
  async saveChunkResult(jobId, chunkIndex, result) {
    try {
      await this.connect();
      
      // 완료 신호 저장 (간단한 방식)
      const completedKey = `completed:${jobId}`;
      const completedData = {
        jobId,
        chunkIndex,
        result,
        timestamp: Date.now()
      };
      
      await this.redisClient.set(completedKey, JSON.stringify(completedData));
      await this.redisClient.expire(completedKey, 3600);
      
      console.log(`📡 Redis에 청크 결과 저장 [${jobId}] 청크 ${chunkIndex}`);
      
    } catch (error) {
      console.error(`❌ Redis 결과 저장 실패 [${jobId}]:`, error);
    }
  }

  // Direct Backend에서 호출: Redis에서 완료된 결과 확인
  async checkCompletedJobs() {
    try {
      await this.connect();
      
      const completedKeys = await this.redisClient.keys('completed:*');
      const results = [];
      
      for (const key of completedKeys) {
        try {
          const resultData = await this.redisClient.get(key);
          if (resultData) {
            const data = JSON.parse(resultData);
            results.push(data);
            
            // 처리된 키 삭제
            await this.redisClient.del(key);
            console.log(`📥 Redis에서 완료된 작업 확인: ${data.jobId}`);
          }
        } catch (parseError) {
          console.error('❌ Redis 결과 파싱 실패:', parseError);
        }
      }
      
      return results;
    } catch (error) {
      console.error('❌ Redis 완료 작업 확인 실패:', error);
      return [];
    }
  }

  async disconnect() {
    if (this.redisClient && this.connected) {
      await this.redisClient.quit();
      this.connected = false;
    }
  }
}

module.exports = new RedisResultBridge(); 