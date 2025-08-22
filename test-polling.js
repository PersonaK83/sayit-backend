const redis = require('redis');

async function testPolling() {
  try {
    console.log('🔍 Redis 폴링 테스트 시작...');
    
    const redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'sayit-redis-m2',
      port: process.env.REDIS_PORT || 6379
    });
    
    await redisClient.connect();
    
    // completed:* 키들 확인
    const completedKeys = await redisClient.keys('completed:*');
    console.log(`📋 발견된 completed 키들: ${completedKeys.length}개`);
    
    for (const key of completedKeys) {
      const data = await redisClient.get(key);
      console.log(`📝 ${key}: ${data}`);
    }
    
    await redisClient.quit();
    
  } catch (error) {
    console.error('❌ 폴링 테스트 실패:', error);
  }
}

testPolling();