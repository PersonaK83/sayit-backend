# 📡 SayIt Backend API 문서

> **RESTful API 명세서** | OpenAI Whisper 기반 STT 변환 서비스

**Base URL**: `http://localhost:3000` (개발) | `http://personak.duckdns.org:3000` (프로덕션)

---

## 📋 **API 개요**

### **🎯 주요 특징**
- **🧠 AI 기반 STT**: OpenAI Whisper Small 모델
- **🇰🇷🇺🇸 언어 최적화**: 한국어 94%, 영어 92% 정확도
- **⚡ 스마트 처리**: 30초 기준 동기/비동기 자동 분기
- **📊 실시간 진행**: 큐 작업 상태 추적
- **🔒 보안**: 파일 검증, CORS, Rate Limiting

### **📊 처리 방식**
```
📱 클라이언트 요청
       ▼
🤖 파일 분석 (크기, 길이)
       ▼
┌─ 소용량 (<30초) ─┐    ┌─ 대용량 (>30초) ─┐
│    즉시 처리      │    │    큐 등록       │
│   (2-5초 응답)    │    │  (jobId 반환)    │
└─ transcription ──┘    └─ 폴링 필요 ──────┘
```

---

## 🎤 **음성 변환 API**

### **POST /api/transcribe**
음성 파일을 텍스트로 변환합니다.

#### **📤 요청 (Request)**
```http
POST /api/transcribe
Content-Type: multipart/form-data

Parameters:
├── file: AudioFile        # [필수] 음성 파일
├── language: string       # [선택] 언어 코드 ('ko'|'en'|'auto')
└── async: boolean        # [선택] 강제 비동기 처리 (기본: false)
```

#### **📝 지원 파일 형식**
| 형식 | 확장자 | 최대 크기 | 권장 품질 |
|------|--------|----------|-----------|
| AAC | `.m4a`, `.aac` | 100MB | 128kbps+ |
| WAV | `.wav` | 100MB | 44.1kHz |  
| MP3 | `.mp3` | 100MB | 192kbps+ |

#### **🌍 언어 코드**
```javascript
language: {
  'ko':   '한국어 (Level 2 최적화)',
  'en':   '영어 (Level 2 최적화)',  
  'auto': '자동 감지 (보수적 설정)'
}
```

#### **📨 응답 (Response)**

##### **✅ 즉시 처리 성공 (동기)**
```json
{
  "success": true,
  "data": {
    "transcription": "안녕하세요. 오늘 날씨가 정말 좋네요.",
    "language": "ko",
    "confidence": 0.94,
    "processingTime": 2.3,
    "wordCount": 8,
    "method": "direct"
  }
}
```

##### **🔄 큐 등록 성공 (비동기)**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued",
    "estimatedTime": 45,
    "queuePosition": 2,
    "method": "async",
    "message": "작업이 큐에 등록되었습니다."
  }
}
```

##### **❌ 오류 응답**
```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE", 
    "message": "파일 크기가 100MB를 초과합니다.",
    "details": {
      "maxSize": "100MB",
      "receivedSize": "150MB"
    }
  }
}
```

#### **📋 오류 코드**
| 코드 | 상태 | 설명 |
|------|------|------|
| `FILE_REQUIRED` | 400 | 파일이 업로드되지 않음 |
| `FILE_TOO_LARGE` | 413 | 파일 크기 초과 (>100MB) |
| `INVALID_FORMAT` | 400 | 지원하지 않는 파일 형식 |
| `INVALID_LANGUAGE` | 400 | 잘못된 언어 코드 |
| `PROCESSING_ERROR` | 500 | STT 처리 중 오류 |
| `QUEUE_FULL` | 503 | 큐가 가득 참 (나중에 재시도) |

#### **💡 사용 예제**

**JavaScript (Fetch)**:
```javascript
async function transcribeAudio(audioFile, language = 'auto') {
  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('language', language);
  
  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      if (result.data.transcription) {
        // 즉시 처리 완료
        console.log('변환 결과:', result.data.transcription);
        return result.data;
      } else if (result.data.jobId) {
        // 비동기 처리 - 폴링 필요
        return await pollForResult(result.data.jobId);
      }
    } else {
      throw new Error(result.error.message);
    }
  } catch (error) {
    console.error('변환 실패:', error);
    throw error;
  }
}
```

**cURL**:
```bash
# 즉시 처리 (소용량 파일)
curl -X POST \
  -F "file=@short_audio.m4a" \
  -F "language=ko" \
  http://personak.duckdns.org:3000/api/transcribe

# 비동기 처리 강제 (테스트용)
curl -X POST \
  -F "file=@long_audio.m4a" \
  -F "language=en" \
  -F "async=true" \
  http://personak.duckdns.org:3000/api/transcribe
```

---

## 🔍 **작업 상태 조회 API**

### **GET /api/transcribe/:jobId**
비동기 작업의 진행 상황을 조회합니다.

#### **📤 요청 (Request)**
```http
GET /api/transcribe/{jobId}

Path Parameters:
└── jobId: string    # [필수] 작업 ID (UUID 형식)
```

#### **📨 응답 (Response)**

##### **🔄 처리 중**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "progress": 65,
    "currentStep": "음성 분할 처리 중...",
    "estimatedRemaining": 23,
    "startedAt": "2024-02-01T10:30:00Z",
    "queuePosition": 0
  }
}
```

##### **✅ 처리 완료**
```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000", 
    "status": "completed",
    "transcription": "긴 음성 파일의 변환된 텍스트입니다.",
    "language": "ko",
    "confidence": 0.92,
    "processingTime": 28.7,
    "wordCount": 156,
    "completedAt": "2024-02-01T10:32:28Z"
  }
}
```

##### **❌ 처리 실패**
```json
{
  "success": false,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "failed",
    "error": {
      "code": "TRANSCRIPTION_ERROR",
      "message": "음성 파일 변환 중 오류가 발생했습니다.",
      "retryable": true
    },
    "failedAt": "2024-02-01T10:31:45Z"
  }
}
```

#### **📊 작업 상태**
| 상태 | 설명 | 다음 단계 |
|------|------|-----------|
| `queued` | 큐에서 대기 중 | 계속 폴링 |
| `processing` | 변환 진행 중 | 계속 폴링 |
| `completed` | 변환 완료 | `transcription` 확인 |
| `failed` | 변환 실패 | 오류 처리 또는 재시도 |
| `expired` | 결과 만료 (24시간) | 재요청 필요 |

#### **💡 폴링 예제**

**JavaScript (적응형 폴링)**:
```javascript
async function pollForResult(jobId) {
  let attempt = 0;
  const maxAttempts = 60; // 5분 최대 대기
  
  while (attempt < maxAttempts) {
    try {
      const response = await fetch(`/api/transcribe/${jobId}`);
      const result = await response.json();
      
      if (result.success) {
        const { status, transcription, progress } = result.data;
        
        if (status === 'completed') {
          return result.data;
        } else if (status === 'failed') {
          throw new Error(result.data.error.message);
        } else if (status === 'processing' || status === 'queued') {
          console.log(`진행률: ${progress}%`);
          // 적응형 간격: 처음 30초는 3초, 이후 5초
          const interval = attempt < 10 ? 3000 : 5000;
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
      
      attempt++;
    } catch (error) {
      console.error('폴링 오류:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempt++;
    }
  }
  
  throw new Error('작업 완료 대기 시간이 초과되었습니다.');
}
```

---

## 🔍 **시스템 상태 API**

### **GET /health**
서버 및 시스템 상태를 확인합니다.

#### **📤 요청 (Request)**
```http
GET /health
```

#### **📨 응답 (Response)**

##### **✅ 정상 상태**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-02-01T10:30:00Z",
    "uptime": 86400,
    "services": {
      "whisper": {
        "status": "online",
        "model": "small",
        "version": "20231117"
      },
      "redis": {
        "status": "connected",
        "memory": "245MB",
        "queueLength": 3
      },
      "workers": {
        "direct": { "status": "active", "load": "60%" },
        "worker1": { "status": "active", "load": "45%" },
        "worker2": { "status": "active", "load": "30%" },
        "worker3": { "status": "active", "load": "15%" }
      }
    },
    "stats": {
      "totalRequests": 1247,
      "successRate": 98.2,
      "averageProcessingTime": 2.8
    }
  }
}
```

##### **⚠️ 부분 장애**
```json
{
  "success": true,
  "data": {
    "status": "degraded",
    "issues": [
      {
        "service": "worker2",
        "status": "down",
        "message": "워커 노드가 응답하지 않습니다.",
        "since": "2024-02-01T09:45:00Z"
      }
    ],
    "impact": "처리 속도가 약간 저하될 수 있습니다."
  }
}
```

---

## ⚙️ **API 사용 가이드라인**

### **📊 Rate Limiting** *(구현 예정)*
```http
X-RateLimit-Limit: 60         # 시간당 허용 요청 수
X-RateLimit-Remaining: 45     # 남은 요청 수
X-RateLimit-Reset: 1643723400 # 리셋 시간 (Unix timestamp)
```

### **🔒 인증** *(구현 예정)*
```http
Authorization: Bearer your-api-token
```

### **📝 요청 헤더**
```http
Content-Type: multipart/form-data    # 파일 업로드 시 필수
Accept: application/json             # 권장
User-Agent: YourApp/1.0.0           # 선택적
```

### **🎯 최적화 팁**

1. **파일 크기 최적화**:
   ```javascript
   // 권장: 2-5MB, 1-2분 길이
   if (fileSize < 5 * 1024 * 1024) {
     // 즉시 처리 가능
   }
   ```

2. **언어 설정**:
   ```javascript
   // 알고 있다면 명시적 지정 권장
   language: 'ko'  // 자동 감지보다 2-3초 빠름
   ```

3. **폴링 최적화**:
   ```javascript
   // 적응형 간격 사용
   const interval = elapsed < 30 ? 3000 : 5000;
   ```

4. **에러 처리**:
   ```javascript
   // 재시도 가능한 오류는 자동 재시도
   if (error.retryable) {
     setTimeout(() => retry(), 5000);
   }
   ```

---

## 🧪 **테스트용 샘플**

### **테스트 파일**
| 파일명 | 크기 | 길이 | 언어 | 예상 처리 방식 |
|--------|------|------|------|----------------|
| `test_ko_short.m4a` | 1.2MB | 15초 | 한국어 | 즉시 처리 |
| `test_en_medium.wav` | 8.5MB | 45초 | 영어 | 큐 처리 |
| `test_mixed_long.mp3` | 25MB | 2분30초 | 혼합 | 큐 처리 |

### **Postman Collection**
```json
{
  "info": { "name": "SayIt Backend API" },
  "item": [
    {
      "name": "음성 변환",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/transcribe",
        "body": {
          "mode": "formdata",
          "formdata": [
            { "key": "file", "type": "file" },
            { "key": "language", "value": "ko" }
          ]
        }
      }
    }
  ]
}
```

---

## 🚨 **문제 해결**

### **자주 발생하는 오류**

#### **1. 파일 업로드 실패**
```json
// 오류: FILE_TOO_LARGE
// 해결: 파일 크기를 100MB 미만으로 압축
```

#### **2. 긴 처리 시간**
```json
// 증상: 5분 이상 처리 지연
// 확인: GET /health로 워커 상태 점검
// 해결: 워커 재시작 또는 대기
```

#### **3. 폴링 타임아웃**
```javascript
// 해결: maxAttempts 증가 또는 간격 조정
const maxAttempts = 120; // 10분 대기
```

### **성능 모니터링**
```bash
# 큐 상태 확인
curl http://personak.duckdns.org:3000/health | jq .data.services.redis.queueLength

# 워커 부하 확인  
curl http://personak.duckdns.org:3000/health | jq .data.services.workers
```

---

**📡 이 API를 통해 SayIt 앱은 고품질의 STT 서비스를 제공합니다!**

---

**관련 문서**: [진행 상황](PROGRESS.md) | [아키텍처](ARCHITECTURE.md) | [성능 최적화](PERFORMANCE.md) | [할 일 목록](TODO.md)
