const redis = require('redis');

async function testRedisFix() {
  try {
    console.log('🧪 Redis 수동 테스트 시작...');
    
    const redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'sayit-redis-m2',
      port: process.env.REDIS_PORT || 6379
    });
    
    await redisClient.connect();
    console.log('✅ Redis 연결 성공');
    
    // 수동으로 완료 신호 저장
    const testJobId = 'job_1755848055335_796e0448';
    const completedKey = `completed:${testJobId}`;
    const completedData = {
      jobId: testJobId,
      chunkIndex: 0,
      result: '우선 제조 원가와 며칠 원가에 대해 알아보겠습니다.',
      timestamp: Date.now()
    };
    
    await redisClient.set(completedKey, JSON.stringify(completedData));
    console.log(`📡 테스트 완료 신호 저장: ${completedKey}`);
    
    // 저장 확인
    const stored = await redisClient.get(completedKey);
    console.log(`📋 저장된 데이터 확인: ${stored}`);
    
    await redisClient.quit();
    console.log('✅ Redis 수동 테스트 완료');
    
  } catch (error) {
    console.error('❌ Redis 테스트 실패:', error);
  }
}

testRedisFix();