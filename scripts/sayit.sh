#!/bin/bash
# scripts/sayit.sh - SayIt M2 통합 관리 스크립트

COMPOSE_FILE="docker-compose-m2-distributed.yml"

# Whisper 설치 확인 및 자동 설치 함수 (근본 해결)
check_and_install_whisper() {
    echo "🔍 모든 백엔드 컨테이너 Whisper 설치 상태 확인 중..."
    
    # 실행 중인 모든 백엔드 관련 컨테이너 찾기
    all_backends=$(docker ps --format "{{.Names}}" | grep -E "(worker|backend|direct)" | grep -v gateway)
    
    if [ -z "$all_backends" ]; then
        echo "⚠️ 실행 중인 백엔드 컨테이너가 없습니다."
        return 1
    fi
    
    echo "📋 발견된 백엔드 컨테이너들:"
    echo "$all_backends" | sed 's/^/   - /'
    echo
    
    for container in $all_backends; do
        echo "🔧 [$container] 완전한 Whisper 환경 설정..."
        
        # 컨테이너 상태 확인
        if ! docker exec $container echo "alive" > /dev/null 2>&1; then
            echo "❌ [$container] 컨테이너 접근 불가"
            continue
        fi
        
        # 1. Python3 확인
        echo "   🐍 Python3 확인 중..."
        if ! docker exec $container which python3 > /dev/null 2>&1; then
            echo "   📦 Python3 설치 중..."
            docker exec -u root $container bash -c "
                apt-get update -qq && 
                apt-get install -y python3-pip python3-venv -qq
            " > /dev/null 2>&1 || {
                echo "   ❌ Python3 설치 실패"
                continue
            }
        fi
        
        # 2. 🎯 핵심: python → python3 심볼릭 링크 생성
        echo "   🔗 python → python3 링크 생성 중..."
        docker exec -u root $container bash -c "
            ln -sf /usr/bin/python3 /usr/bin/python &&
            echo '✅ python 링크 생성 완료'
        " || echo "   ⚠️ python 링크 생성 실패"
        
        # 3. Whisper 설치 확인 (transcribe.js와 동일한 방식)
        echo "   🔍 Whisper Python 모듈 확인 중..."
        if docker exec $container python3 -c "import whisper; print('installed')" > /dev/null 2>&1; then
            echo "   ✅ Whisper Python 모듈 정상 설치됨"
        else
            echo "   📦 Whisper 설치 중..."
            docker exec -u root $container bash -c "
                echo '🔧 pip 업그레이드 중...' &&
                pip3 install --upgrade pip --quiet &&
                echo '🎙️ Whisper 설치 중...' &&
                pip3 install openai-whisper --quiet
            " > /dev/null 2>&1 || {
                echo "   ❌ Whisper 설치 실패"
                continue
            }
            
            # 재확인
            if docker exec $container python3 -c "import whisper; print('installed')" > /dev/null 2>&1; then
                echo "   ✅ Whisper Python 모듈 설치 완료"
            else
                echo "   ❌ Whisper Python 모듈 설치 실패"
            fi
        fi
        
        # 4. 🎯 핵심: python 명령어로도 Whisper 확인
        echo "   🔍 python 명령어 Whisper 확인..."
        if docker exec $container python -c "import whisper; print('installed')" > /dev/null 2>&1; then
            echo "   ✅ python 명령어로 Whisper 접근 가능"
        else
            echo "   ❌ python 명령어로 Whisper 접근 불가"
        fi
        
        # 5. 최종 확인 - 실제 워커 로직과 동일한 테스트
        echo "   🧪 실제 워커 로직 테스트..."
        test_result=$(docker exec $container python -m whisper --help 2>&1 | head -1)
        if [[ $test_result == *"usage: whisper"* ]]; then
            echo "   ✅ 실제 워커 로직 테스트 성공"
        else
            echo "   ❌ 실제 워커 로직 테스트 실패: $test_result"
        fi
        
        echo
    done
    
    echo "🎯 모든 백엔드 컨테이너 완전한 Whisper 환경 설정 완료!"
}

# 큐 시스템 상태 확인 및 정리
check_and_clean_queue() {
    echo "🔍 큐 시스템 상태 확인 중..."
    
    # Redis 연결 확인
    if ! docker exec sayit-redis-m2 redis-cli ping > /dev/null 2>&1; then
        echo "❌ Redis 연결 실패"
        return 1
    fi
    
    # 큐 상태 확인
    echo "📊 현재 큐 상태:"
    docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory_human"
    
    # 실패한 작업 확인
    failed_count=$(docker exec sayit-redis-m2 redis-cli keys "*:failed" 2>/dev/null | wc -l)
    
    if [ "$failed_count" -gt 0 ]; then
        echo "🧹 실패한 작업 $failed_count개 발견. 정리하시겠습니까? (y/N)"
        read -p "선택: " clean_choice
        if [[ $clean_choice =~ ^[Yy]$ ]]; then
            docker exec sayit-redis-m2 redis-cli FLUSHDB > /dev/null
            echo "✅ 큐 정리 완료"
        fi
    else
        echo "✅ 큐 상태 정상 (실패한 작업 없음)"
    fi
}

# 비동기 작업 디버깅 함수 (개선)
debug_async_jobs() {
    echo "🔍 비동기 작업 디버깅 시작..."
    
    # 1. Redis 큐 상태 간단 확인
    echo "📊 Redis 큐 상태:"
    docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory"
    docker exec sayit-redis-m2 redis-cli keys "*bull*" | wc -l | xargs echo "Bull 키 개수:"
    
    # 2. Direct Backend에서 transcriptionJobs 상태 확인
    echo
    echo "📋 Direct Backend 작업 상태:"
    curl -s http://localhost:3000/api/transcribe/jobs 2>/dev/null || echo "작업 목록 API 호출 실패"
    
    # 3. 각 워커의 상세 로그 확인
    echo
    echo "⚡ 워커별 상세 처리 로그:"
    for worker in sayit-worker-1-m2 sayit-worker-2-m2 sayit-worker-3-m2; do
        if docker ps --format "{{.Names}}" | grep -q "$worker"; then
            echo "--- $worker (최근 10줄) ---"
            docker logs $worker --tail 10 2>/dev/null | grep -E "(청크|Whisper|완료|실패|결과|collect)"
        fi
    done
    
    # 4. Direct Backend의 Result Collector 관련 로그
    echo
    echo "📡 Result Collector 관련 로그:"
    docker logs sayit-direct-backend --tail 30 2>/dev/null | grep -E "(completed|failed|이벤트|상태 업데이트|Result Collector|collectChunkResult)"
    
    # 5. 현재 진행 중인 작업의 상세 상태
    echo
    echo "🎯 진행 중인 작업 상세 분석:"
    active_jobs=$(curl -s http://localhost:3000/api/transcribe/jobs | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for job in data.get('jobs', []):
        if job.get('status') == 'processing':
            print(f\"작업 ID: {job.get('id')}\")
            print(f\"상태: {job.get('status')}\")
            print(f\"시작 시간: {job.get('startedAt')}\")
            print(f\"파일: {job.get('originalFilename')}\")
except:
    pass
" 2>/dev/null)
    
    if [ -n "$active_jobs" ]; then
        echo "$active_jobs"
    else
        echo "진행 중인 작업 없음"
    fi
}

# 워커 연결 상태 확인 함수
check_worker_connections() {
    echo "🔗 워커-Redis 연결 상태 확인..."
    
    for worker in sayit-worker-1-m2 sayit-worker-2-m2 sayit-worker-3-m2; do
        if docker ps --format "{{.Names}}" | grep -q "$worker"; then
            echo "--- $worker ---"
            
            # Redis 연결 확인
            redis_test=$(docker exec $worker redis-cli -h sayit-redis-m2 ping 2>/dev/null || echo "FAIL")
            echo "Redis 연결: $redis_test"
            
            # 큐 연결 확인
            queue_test=$(docker logs $worker --tail 50 2>/dev/null | grep -E "(큐 시스템|Redis 연결)" | tail -1)
            echo "큐 상태: $queue_test"
            
            # 최근 작업 처리 상태
            recent_work=$(docker logs $worker --tail 20 2>/dev/null | grep -E "(청크 처리|작업)" | tail -2)
            echo "최근 작업: $recent_work"
            echo
        fi
    done
}

# 작업 상태 강제 확인 함수
check_job_status() {
    echo "📊 현재 진행 중인 작업 상태 확인..."
    
    read -p "작업 ID를 입력하세요 (예: job_1755838320384_b48f81c4): " job_id
    
    if [ -z "$job_id" ]; then
        echo "❌ 작업 ID가 입력되지 않았습니다."
        return 1
    fi
    
    echo "🔍 작업 상태 조회: $job_id"
    curl -s "http://localhost:3000/api/transcribe/status/$job_id" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:3000/api/transcribe/status/$job_id"
}

# Result Collector 연결 디버깅 함수
debug_result_collector() {
    echo "🔍 Result Collector 연결 디버깅..."
    
    # 1. 워커에서 Result Collector 접근 테스트
    echo "📡 워커 → Result Collector 연결 테스트:"
    
    for worker in sayit-worker-1-m2 sayit-worker-2-m2 sayit-worker-3-m2; do
        if docker ps --format "{{.Names}}" | grep -q "$worker"; then
            echo "--- $worker ---"
            
            # 워커 컨테이너에서 result-collector 모듈 확인
            collector_test=$(docker exec $worker node -e "
try {
    const resultCollector = require('./services/result-collector');
    console.log('✅ Result Collector 모듈 로드 성공');
    console.log('📊 타입:', typeof resultCollector);
    console.log('📋 메서드:', Object.getOwnPropertyNames(resultCollector).join(', '));
} catch (error) {
    console.log('❌ Result Collector 로드 실패:', error.message);
}
" 2>/dev/null)
            echo "$collector_test"
            echo
        fi
    done
    
    # 2. Direct Backend에서 Result Collector 상태 확인
    echo "🏠 Direct Backend Result Collector 상태:"
    docker exec sayit-direct-backend node -e "
try {
    const resultCollector = require('./services/result-collector');
    console.log('✅ Result Collector 활성화됨');
    console.log('📊 현재 작업 수:', resultCollector.jobs ? resultCollector.jobs.size : 'Unknown');
    console.log('🎯 이벤트 리스너 수:', resultCollector.listenerCount('completed'));
} catch (error) {
    console.log('❌ Result Collector 확인 실패:', error.message);
}
" 2>/dev/null
}

# 강제 작업 완료 함수
force_complete_job() {
    echo "🔧 작업 강제 완료 처리..."
    
    read -p "완료 처리할 작업 ID를 입력하세요: " job_id
    
    if [ -z "$job_id" ]; then
        echo "❌ 작업 ID가 입력되지 않았습니다."
        return 1
    fi
    
    echo "🎯 작업 강제 완료 처리: $job_id"
    
    # Direct Backend에서 강제 완료 처리
    docker exec sayit-direct-backend node -e "
const resultCollector = require('./services/result-collector');

// 테스트 결과로 강제 완료
resultCollector.collectChunkResult('$job_id', 0, '강제 완료된 작업입니다.');

console.log('✅ 강제 완료 처리 완료');
" 2>/dev/null || echo "❌ 강제 완료 처리 실패"
    
    # 완료 후 상태 확인
    sleep 3
    curl -s "http://localhost:3000/api/transcribe/status/$job_id" | python3 -m json.tool 2>/dev/null
}

# Result Collector 문제 해결 함수
fix_result_collector() {
    echo "🔧 Result Collector 통신 문제 해결 중..."
    
    # 1. 현재 문제 상황 확인
    echo "📊 현재 문제 상황:"
    echo "   - 워커에서 처리 완료됨"
    echo "   - Direct Backend로 결과 전달 안됨"
    echo "   - 각 컨테이너가 독립적인 Result Collector 인스턴스 사용"
    
    # 2. Redis를 통한 결과 전달 방식으로 수정
    echo "🔧 Redis 기반 결과 전달 방식으로 수정 중..."
    
    # Direct Backend에 Redis 결과 수신 리스너 추가
    docker exec sayit-direct-backend node -e "
const redis = require('redis');
const client = redis.createClient({
    host: 'sayit-redis-m2',
    port: 6379
});

// Redis에서 완료된 작업 결과 확인
client.on('connect', () => {
    console.log('✅ Redis 연결됨');
    
    // 완료된 작업 키 확인
    client.keys('result:*', (err, keys) => {
        if (keys && keys.length > 0) {
            console.log('📋 Redis에 저장된 결과들:', keys);
            
            keys.forEach(key => {
                client.get(key, (err, result) => {
                    if (result) {
                        console.log('📝 결과:', key, '→', result.substring(0, 100) + '...');
                    }
                });
            });
        } else {
            console.log('📋 Redis에 저장된 결과 없음');
        }
    });
});

client.connect().catch(console.error);

setTimeout(() => {
    client.quit();
}, 3000);
" 2>/dev/null || echo "Redis 결과 확인 실패"
    
    echo "✅ Result Collector 진단 완료"
}

# 멈춘 작업 복구 함수
recover_stuck_jobs() {
    echo "🔧 멈춘 작업 복구 시작..."
    
    # 1. 현재 processing 상태인 작업들 찾기
    echo "📊 멈춘 작업 찾는 중..."
    stuck_jobs=$(curl -s http://localhost:3000/api/transcribe/jobs | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    stuck = []
    for job in data.get('jobs', []):
        if job.get('status') == 'processing':
            # 5분 이상 처리 중인 작업
            import time
            created = job.get('createdAt', 0) / 1000
            if time.time() - created > 300:  # 5분
                stuck.append(job.get('id'))
    
    if stuck:
        print('멈춘 작업들:', ','.join(stuck))
    else:
        print('없음')
except Exception as e:
    print('오류:', e)
" 2>/dev/null)
    
    echo "🎯 멈춘 작업: $stuck_jobs"
    
    if [ "$stuck_jobs" != "없음" ] && [ -n "$stuck_jobs" ]; then
        echo "🔧 멈춘 작업들을 완료 상태로 변경하시겠습니까? (y/N)"
        read -p "선택: " fix_choice
        
        if [[ $fix_choice =~ ^[Yy]$ ]]; then
            # 각 멈춘 작업을 강제 완료 처리
            IFS=',' read -ra JOBS <<< "$stuck_jobs"
            for job_id in "${JOBS[@]}"; do
                job_id=$(echo "$job_id" | tr -d ' ')
                echo "🎯 작업 복구 중: $job_id"
                
                # Direct Backend에서 강제 완료
                docker exec sayit-direct-backend node -e "
const fs = require('fs');
const path = require('path');

// transcriptionJobs Map에 직접 접근하여 상태 변경
console.log('🔧 작업 상태 강제 업데이트: $job_id');

// API를 통해 상태 업데이트
const http = require('http');
const postData = JSON.stringify({
    jobId: '$job_id',
    status: 'completed',
    transcript: '복구된 작업입니다. 다시 변환해주세요.',
    force: true
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/transcribe/force-complete',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = http.request(options, (res) => {
    console.log('✅ 강제 완료 요청 전송됨');
});

req.write(postData);
req.end();
" 2>/dev/null || echo "강제 완료 실패: $job_id"
            done
            
            echo "✅ 멈춘 작업 복구 완료"
        fi
    else
        echo "✅ 멈춘 작업 없음"
    fi
}

# Redis 기반 결과 전달 시스템 적용 (개선)
apply_redis_fix() {
    echo "🔧 Redis 기반 결과 전달 시스템 적용 중..."
    
    # 1. 백업 생성
    echo "💾 기존 파일 백업 중..."
    cp services/transcription-queue.js services/transcription-queue.js.backup
    cp routes/transcribe.js routes/transcribe.js.backup
    
    # 2. transcription-queue.js에서 Redis 전송 방식으로 수정
    echo "🔧 transcription-queue.js 수정 중..."
    
    # resultCollector.collectChunkResult 부분을 Redis publish로 교체
    sed -i.tmp '/resultCollector\.collectChunkResult/c\
    // Redis를 통한 결과 전달\
    try {\
      const redis = require("redis");\
      const redisClient = redis.createClient({\
        host: process.env.REDIS_HOST || "sayit-redis-m2",\
        port: process.env.REDIS_PORT || 6379\
      });\
      await redisClient.connect();\
      \
      const message = {\
        jobId,\
        chunkIndex,\
        result: result.text,\
        timestamp: Date.now()\
      };\
      \
      await redisClient.publish("chunk-results", JSON.stringify(message));\
      console.log(`📡 Redis로 청크 결과 전송 [${jobId}] 청크 ${chunkIndex}`);\
      await redisClient.quit();\
    } catch (redisError) {\
      console.error(`❌ Redis 결과 전송 실패:`, redisError);\
    }' services/transcription-queue.js
    
    # 3. routes/transcribe.js에 Redis 구독 리스너 추가
    echo "🔧 routes/transcribe.js에 Redis 구독 추가 중..."
    
    # Redis 구독 코드를 파일 끝에 추가
    cat >> routes/transcribe.js << 'REDIS_LISTENER_EOF'

// 🎯 Redis 기반 결과 수신 시스템
const redis = require('redis');

async function setupRedisResultListener() {
  try {
    const subscriber = redis.createClient({
      host: process.env.REDIS_HOST || 'sayit-redis-m2',
      port: process.env.REDIS_PORT || 6379
    });

    await subscriber.connect();
    
    await subscriber.subscribe('chunk-results', (message) => {
      try {
        const { jobId, chunkIndex, result } = JSON.parse(message);
        console.log(`📥 Redis에서 청크 결과 수신 [${jobId}] 청크 ${chunkIndex}`);
        
        // transcriptionJobs 상태 업데이트
        const job = transcriptionJobs.get(jobId);
        if (job) {
          // 간단한 완료 처리 (1개 청크이므로)
          job.status = JobStatus.COMPLETED;
          job.completedAt = Date.now();
          job.transcript = result;
          job.error = null;
          transcriptionJobs.set(jobId, job);
          
          console.log(`✅ Redis 기반 작업 상태 업데이트 완료 [${jobId}]: ${JobStatus.COMPLETED}`);
          console.log(`📝 최종 결과: ${result}`);
        } else {
          console.warn(`⚠️ Redis 수신: 작업 ID를 찾을 수 없음: ${jobId}`);
        }
      } catch (parseError) {
        console.error('❌ Redis 메시지 파싱 실패:', parseError);
      }
    });

    console.log('✅ Redis 결과 구독 리스너 설정 완료');
  } catch (error) {
    console.error('❌ Redis 구독 설정 실패:', error);
  }
}

// Redis 리스너 시작
setupRedisResultListener();
REDIS_LISTENER_EOF
    
    echo "✅ Redis 구독 리스너 추가 완료"
    
    # 4. 시스템 재시작
    echo "🔄 Redis 기반 시스템 재시작 중..."
    stop_system
    sleep 5
    start_system
    
    echo "✅ Redis 기반 결과 전달 시스템 적용 완료!"
    echo "🧪 이제 앱에서 비동기 변환을 다시 테스트해보세요!"
}

# Redis 구독 상태 확인 함수
check_redis_subscription() {
    echo "📡 Redis 구독 상태 확인 중..."
    
    # Redis에서 구독자 확인
    echo "📊 Redis 구독자 정보:"
    docker exec sayit-redis-m2 redis-cli pubsub channels | grep chunk-results || echo "chunk-results 채널 없음"
    docker exec sayit-redis-m2 redis-cli pubsub numsub chunk-results
    
    # Direct Backend에서 구독 상태 확인
    echo "🏠 Direct Backend 구독 상태:"
    docker logs sayit-direct-backend --tail 10 | grep -E "(Redis|구독|subscription)"
    
    # 테스트 메시지 전송
    echo "🧪 테스트 메시지 전송..."
    docker exec sayit-redis-m2 redis-cli publish chunk-results '{"jobId":"test","chunkIndex":0,"result":"테스트 메시지","timestamp":1234567890}'
    
    sleep 2
    echo "📋 테스트 메시지 수신 확인:"
    docker logs sayit-direct-backend --tail 5 | grep -E "(테스트|Redis|수신)"
}

# Redis 구독 문제 진단 및 수정
fix_redis_subscription() {
    echo "🔧 Redis 구독 문제 진단 및 수정 중..."
    
    # 1. Direct Backend 컨테이너 내부에서 Redis 구독 테스트
    echo "🧪 Direct Backend Redis 연결 테스트..."
    docker exec sayit-direct-backend node -e "
const redis = require('redis');

async function testRedis() {
  try {
    console.log('🔗 Redis 클라이언트 생성 중...');
    const client = redis.createClient({
      host: 'sayit-redis-m2',
      port: 6379
    });
    
    console.log('📡 Redis 연결 중...');
    await client.connect();
    console.log('✅ Redis 연결 성공');
    
    console.log('📋 Redis 정보 확인...');
    const info = await client.info();
    console.log('📊 Redis 상태: 연결됨');
    
    await client.quit();
    console.log('✅ Redis 연결 테스트 완료');
    
  } catch (error) {
    console.error('❌ Redis 연결 실패:', error.message);
  }
}

testRedis();
" 2>/dev/null || echo "❌ Redis 연결 테스트 실패"
    
    # 2. 현재 routes/transcribe.js에 Redis 구독이 추가되었는지 확인
    echo "📝 Redis 구독 코드 확인 중..."
    redis_listener_exists=$(grep -c "setupRedisResultListener" routes/transcribe.js 2>/dev/null || echo "0")
    
    if [ "$redis_listener_exists" -eq "0" ]; then
        echo "❌ Redis 구독 코드가 추가되지 않았습니다."
        echo "🔧 Redis 구독 코드 추가 중..."
        
        # Redis 구독 코드를 routes/transcribe.js에 추가
        cat >> routes/transcribe.js << 'REDIS_SUB_EOF'

// 🎯 Redis 기반 결과 수신 시스템
const redis = require('redis');

async function setupRedisResultListener() {
  try {
    console.log('🔗 Redis 결과 구독 시스템 초기화 중...');
    
    const subscriber = redis.createClient({
      host: process.env.REDIS_HOST || 'sayit-redis-m2',
      port: process.env.REDIS_PORT || 6379
    });

    await subscriber.connect();
    console.log('✅ Redis 구독자 연결 성공');
    
    await subscriber.subscribe('chunk-results', (message) => {
      try {
        const { jobId, chunkIndex, result } = JSON.parse(message);
        console.log(`📥 Redis에서 청크 결과 수신 [${jobId}] 청크 ${chunkIndex}`);
        console.log(`📝 수신된 결과: ${result?.substring(0, 100)}...`);
        
        // transcriptionJobs 상태 업데이트
        const job = transcriptionJobs.get(jobId);
        if (job) {
          job.status = JobStatus.COMPLETED;
          job.completedAt = Date.now();
          job.transcript = result;
          job.error = null;
          transcriptionJobs.set(jobId, job);
          
          console.log(`✅ Redis 기반 작업 상태 업데이트 완료 [${jobId}]: ${JobStatus.COMPLETED}`);
        } else {
          console.warn(`⚠️ Redis 수신: 작업 ID를 찾을 수 없음: ${jobId}`);
        }
      } catch (parseError) {
        console.error('❌ Redis 메시지 파싱 실패:', parseError);
      }
    });

    console.log('✅ Redis 결과 구독 리스너 설정 완료');
  } catch (error) {
    console.error('❌ Redis 구독 설정 실패:', error);
  }
}

// Redis 리스너 시작
setupRedisResultListener();
REDIS_SUB_EOF
        
        echo "✅ Redis 구독 코드 추가 완료"
    else
        echo "✅ Redis 구독 코드 이미 존재"
    fi
    
    # 3. transcription-queue.js에 Redis 전송 코드 추가
    echo "🔧 transcription-queue.js Redis 전송 코드 확인 중..."
    
    # 기존 resultCollector 호출을 찾아서 Redis 전송으로 교체
    if grep -q "resultCollector.collectChunkResult" services/transcription-queue.js; then
        echo "🔄 resultCollector를 Redis 전송으로 교체 중..."
        
        # 임시 파일 생성
        cat > /tmp/redis-fix.js << 'TEMP_FIX_EOF'
    // 🎯 Redis를 통한 결과 전달 (기존 resultCollector 대체)
    try {
      const redis = require('redis');
      const redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'sayit-redis-m2',
        port: process.env.REDIS_PORT || 6379
      });
      
      await redisClient.connect();
      
      const message = {
        jobId,
        chunkIndex,
        result: result.text,
        timestamp: Date.now()
      };
      
      await redisClient.publish('chunk-results', JSON.stringify(message));
      console.log(`📡 Redis로 청크 결과 전송 [${jobId}] 청크 ${chunkIndex}`);
      await redisClient.quit();
    } catch (redisError) {
      console.error(`❌ Redis 결과 전송 실패:`, redisError);
    }
TEMP_FIX_EOF
        
        # resultCollector 호출 부분을 Redis 전송으로 교체
        sed -i.bak '/resultCollector\.collectChunkResult/r /tmp/redis-fix.js' services/transcription-queue.js
        sed -i.bak '/resultCollector\.collectChunkResult/d' services/transcription-queue.js
        
        echo "✅ Redis 전송 코드 교체 완료"
        rm /tmp/redis-fix.js
    else
        echo "✅ resultCollector 호출이 이미 수정됨"
    fi
    
    # 4. 시스템 재시작
    echo "🔄 Redis 기반 시스템 재시작 중..."
    stop_system
    sleep 5
    start_system
    
    echo "✅ Redis 기반 결과 전달 시스템 적용 완료!"
    echo
    echo "🧪 테스트 방법:"
    echo "1. 17번 메뉴로 Redis 구독 상태 확인"
    echo "2. 앱에서 비동기 변환 테스트"
    echo "3. 11번 메뉴로 디버깅 확인"
}

show_menu() {
    echo "========================================="
    echo "   🍎 SayIt M2 분산처리 관리자"
    echo "========================================="
    echo "1. 🚀 시스템 시작"
    echo "2. 🛑 시스템 중지"
    echo "3. 🔄 재시작"
    echo "4. 📊 상태 확인"
    echo "5. 📋 로그 확인"
    echo "6. 🔧 Gateway 수정"
    echo "7. 🧪 연결 테스트"
    echo "8. 🎙️ Whisper 설치/확인"
    echo "9. 🧹 큐 정리"
    echo "10. 📊 Whisper 모델 확인"
    echo "11. 🔍 비동기 작업 디버깅"
    echo "12. 📊 작업 상태 조회"
    echo "13. 🔗 워커 연결 확인"
    echo "14. 📡 Result Collector 디버깅"
    echo "15. 🔧 멀춘 작업 복구"
    echo "16. 🚀 Redis 기반 시스템 적용"
    echo "17. 📡 Redis 구독 상태 확인"
    echo "0. 종료"
    echo "========================================="
}

start_system() {
    echo "🚀 SayIt M2 분산처리 시스템 시작 중..."
    
    # Docker 확인
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker가 실행되지 않았습니다."
        return 1
    fi
    
    # 기존 컨테이너 정리
    echo "🧹 기존 컨테이너 정리 중..."
    docker stop sayit-direct-backend 2>/dev/null
    docker rm sayit-direct-backend 2>/dev/null
    docker-compose -f $COMPOSE_FILE down 2>/dev/null
    
    # 분산처리 시스템 시작
    echo "🏗️ 분산처리 시스템 시작 중..."
    docker-compose -f $COMPOSE_FILE up -d
    
    # 대기
    echo "⏳ 시스템 초기화 대기 중..."
    sleep 20
    
    # Gateway 상태 확인
    if docker ps --format "{{.Names}}" | grep -q "sayit-gateway-m2"; then
        if docker ps | grep "sayit-gateway-m2" | grep -q "Restarting"; then
            echo "⚠️ Gateway가 재시작 중입니다. 워커를 직접 연결합니다..."
            fix_gateway_direct
        else
            echo "✅ Gateway 정상 작동 중!"
        fi
    else
        echo "❌ Gateway 시작 실패. 워커를 직접 연결합니다..."
        fix_gateway_direct
    fi
    
    # Whisper 자동 설치 확인 (시스템 시작 후)
    echo
    echo "🔧 모든 백엔드 컨테이너 Whisper 설치 상태 자동 확인..."
    check_and_install_whisper
    
    # 큐 시스템 정리
    echo
    check_and_clean_queue
    
    show_final_status
}

fix_gateway_direct() {
    echo "🔧 워커 직접 연결 모드로 전환 중..."
    
    # Gateway 중지
    docker stop sayit-gateway-m2 2>/dev/null
    docker rm sayit-gateway-m2 2>/dev/null
    
    # 워커 1을 포트 3000으로 직접 연결
    docker run -d \
      --name sayit-direct-backend \
      -p 3000:3000 \
      --network sayit-backend_sayit-network \
      -e REDIS_HOST=sayit-redis-m2 \
      -e WORKER_ID=direct-worker \
      -e NODE_ENV=production \
      -v $(pwd)/uploads:/app/uploads \
      -v $(pwd)/temp:/app/temp \
      sayit-backend-whisper-worker-1:latest
    
    echo "⏳ 직접 백엔드 시작 대기 중..."
    sleep 15
    
    # 직접 연결된 백엔드에 Whisper 설치 확인 (강화)
    echo "🔧 직접 연결된 백엔드 Whisper 확인..."
    if docker exec sayit-direct-backend which whisper > /dev/null 2>&1; then
        echo "✅ 직접 백엔드 Whisper 이미 설치됨"
    else
        echo "📦 직접 백엔드에 Whisper 설치 중..."
        docker exec -u root sayit-direct-backend bash -c "
            echo '🐍 Python3 설치 중...' &&
            apt-get update -qq && 
            apt-get install -y python3-pip python3-venv -qq &&
            echo '🎙️ Whisper 설치 중...' &&
            pip3 install openai-whisper --quiet &&
            echo '✅ 설치 완료'
        " || {
            echo "❌ 직접 백엔드 Whisper 설치 실패"
        }
        
        # 설치 확인
        if docker exec sayit-direct-backend which whisper > /dev/null 2>&1; then
            echo "✅ 직접 백엔드 Whisper 설치 확인 완료"
        else
            echo "❌ 직접 백엔드 Whisper 설치 실패"
        fi
    fi
    
    echo "✅ 워커 직접 연결 완료!"
}

stop_system() {
    echo "🛑 시스템 중지 중..."
    
    # 직접 연결된 백엔드 중지
    docker stop sayit-direct-backend 2>/dev/null
    docker rm sayit-direct-backend 2>/dev/null
    
    # 분산처리 시스템 중지
    docker-compose -f $COMPOSE_FILE down
    
    echo "✅ 시스템 중지 완료!"
}

show_status() {
    echo "📊 시스템 상태:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo
    
    # Redis 상태
    if docker ps --format "{{.Names}}" | grep -q "sayit-redis-m2"; then
        echo "🔗 Redis 상태:"
        docker exec sayit-redis-m2 redis-cli ping 2>/dev/null && echo "✅ Redis 연결됨" || echo "❌ Redis 연결 실패"
        echo "📊 큐 상태:"
        docker exec sayit-redis-m2 redis-cli info | grep -E "connected_clients|used_memory_human"
    fi
    
    # API 상태
    echo
    echo "🌐 API 상태:"
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        api_response=$(curl -s http://localhost:3000/api/health)
        echo "✅ API 연결됨: $api_response"
    else
        echo "❌ API 연결 실패"
    fi
    
    # Whisper 설치 상태 확인
    echo
    echo "🎙️ Whisper 설치 상태:"
    all_backends=$(docker ps --format "{{.Names}}" | grep -E "(worker|backend|direct)")
    for container in $all_backends; do
        if docker exec $container which whisper > /dev/null 2>&1; then
            echo "   ✅ $container: 설치됨"
        else
            echo "   ❌ $container: 미설치"
        fi
    done
    
    
    # 접속 정보
    local_ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    echo
    echo "📍 접속 정보:"
    echo "   로컬: http://localhost:3000"
    echo "   네트워크: http://$local_ip:3000"
    echo "   모니터링: http://$local_ip:9100"
}

show_final_status() {
    echo
    echo "========================================="
    echo "   ✅ SayIt M2 시스템 시작 완료!"
    echo "========================================="
    show_status
}

show_logs() {
    echo "📋 로그 옵션:"
    echo "1. 전체 로그"
    echo "2. 직접 백엔드 로그"
    echo "3. 워커 로그"
    echo "4. Redis 로그"
    echo "5. Gateway 로그"
    read -p "선택하세요 (1-5): " log_choice
    
    case $log_choice in
        1) docker-compose -f $COMPOSE_FILE logs --tail=50 ;;
        2) 
            if docker ps --format "{{.Names}}" | grep -q "sayit-direct-backend"; then
                docker logs sayit-direct-backend --tail=50
            else
                echo "❌ 직접 백엔드가 실행되지 않음"
            fi
            ;;
        3) 
            echo "=== Worker 1 ==="
            docker logs sayit-worker-1-m2 --tail=20 2>/dev/null
            echo "=== Worker 2 ==="
            docker logs sayit-worker-2-m2 --tail=20 2>/dev/null
            echo "=== Worker 3 ==="
            docker logs sayit-worker-3-m2 --tail=20 2>/dev/null
            ;;
        4) docker logs sayit-redis-m2 --tail=30 ;;
        5) docker logs sayit-gateway-m2 --tail=20 2>/dev/null || echo "❌ Gateway 실행되지 않음" ;;
        *) echo "❌ 잘못된 선택입니다." ;;
    esac
}

test_connection() {
    echo "🧪 연결 테스트 시작..."
    
    # 로컬 연결 테스트
    echo "📍 로컬 연결 테스트:"
    curl -s http://localhost:3000/api/health && echo " ✅" || echo " ❌"
    
    # 외부 연결 테스트
    local_ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    echo "🌐 외부 연결 테스트 ($local_ip):"
    curl -s http://$local_ip:3000/api/health && echo " ✅" || echo " ❌"
    
    # 진단 API
    echo "🔍 시스템 진단:"
    curl -s http://localhost:3000/api/diagnose | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/api/diagnose
    
    # STT 테스트 (간단한 파일로)
    echo
    echo "🎙️ STT 기능 테스트:"
    if [ -f "./temp/voice-test.wav" ]; then
        echo "📁 테스트 파일로 STT 변환 테스트 중..."
        curl -X POST http://localhost:3000/api/transcribe \
          -F "audio=@./temp/voice-test.wav;type=audio/wav" \
          -F "language=auto" \
          -s | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f\"   ✅ STT 테스트: {data.get('success', False)}\")
    print(f\"   📝 방식: {data.get('method', 'Unknown')}\")
    print(f\"   🎙️ Whisper: {data.get('whisperInstalled', False)}\")
except:
    print('   ❌ STT 테스트 실패')
"
    else
        echo "   ⚠️ 테스트 파일 없음 (./temp/voice-test.wav)"
    fi
}

# 메뉴에 "🔍 Whisper 디버깅" 옵션 추가
debug_whisper() {
    echo "🔍 Whisper 설치 디버깅 시작..."
    
    containers=$(docker ps --format "{{.Names}}" | grep -E "(worker|backend|direct)")
    
    for container in $containers; do
        echo "========== [$container] 디버깅 =========="
        
        # Python 경로 확인
        echo "🐍 Python 정보:"
        docker exec $container which python3
        docker exec $container python3 --version
        
        # pip 정보
        echo "📦 pip 정보:"
        docker exec $container which pip3
        docker exec $container pip3 --version
        
        # Whisper 바이너리 확인
        echo "🎙️ Whisper 바이너리:"
        docker exec $container which whisper || echo "바이너리 없음"
        
        # Python 모듈 확인 (transcribe.js와 동일)
        echo "🔍 Python 모듈 확인:"
        docker exec $container python3 -c "
try:
    import whisper
    print('✅ Whisper 모듈 import 성공')
    print('📍 Whisper 위치:', whisper.__file__)
    print('📝 Whisper 버전:', getattr(whisper, '__version__', 'Unknown'))
except ImportError as e:
    print('❌ Whisper 모듈 import 실패:', e)
    print('🔍 설치된 패키지 목록:')
    import subprocess
    result = subprocess.run(['pip3', 'list'], capture_output=True, text=True)
    print(result.stdout)
except Exception as e:
    print('❌ 기타 오류:', e)
"
        echo "================================"
        echo
    done
}

# 메인 루프 업데이트
while true; do
    show_menu
    read -p "선택하세요 (0-9): " choice
    
    case $choice in
        1) start_system ;;
        2) stop_system ;;
        3) stop_system && sleep 3 && start_system ;;
        4) show_status ;;
        5) show_logs ;;
        6) fix_gateway_direct ;;
        7) test_connection ;;
        8) check_and_install_whisper ;;
        9) check_and_clean_queue ;;
        10) check_whisper_models ;;
        11) debug_async_jobs ;;
        12) check_job_status ;;
        13) check_worker_connections ;;
        14) debug_result_collector ;;
        15) recover_stuck_jobs ;;
        16) apply_redis_fix ;;
        17) check_redis_subscription ;;
        0) echo "👋 관리자를 종료합니다."; exit 0 ;;
        *) echo "❌ 잘못된 선택입니다." ;;
    esac
    
    
    echo
    read -p "계속하려면 Enter를 누르세요..."
done