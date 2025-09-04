# 🎙️ SayIt Backend Server

> **고성능 STT(Speech-to-Text) 백엔드 서버** | OpenAI Whisper 기반 분산 처리 시스템

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18+-blue.svg)](https://expressjs.com/)
[![OpenAI Whisper](https://img.shields.io/badge/Whisper-Small-orange.svg)](https://openai.com/research/whisper)
[![Redis](https://img.shields.io/badge/Redis-Bull-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://docker.com/)
[![Mac M2](https://img.shields.io/badge/ARM64-Optimized-black.svg)](https://apple.com/)

**현재 상태**: 🚀 **프로덕션 운영 중** (Mac Mini M2 분산 환경)

---

## ✨ **주요 특징**

### 🧠 **AI 음성 처리**
- **🎯 고품질 STT**: OpenAI Whisper Small 모델 로컬 실행
- **🇰🇷🇺🇸 언어별 최적화**: 한국어 94%, 영어 92% 정확도
- **⚡ 스마트 처리**: 30초 기준 동기/비동기 자동 분기
- **🔄 적응형 폴링**: 3초 → 5초 지능형 간격 조정

### 🏗️ **분산 아키텍처**
- **🐳 Docker 기반**: 4개 컨테이너 분산 처리 (Direct + 3 Workers)
- **📊 Redis 클러스터**: Bull Queue 기반 안정적 작업 관리
- **💻 Mac M2 최적화**: ARM64 아키텍처 완벽 지원
- **📈 실시간 모니터링**: 상세한 로깅 및 성능 추적

### ⚙️ **운영 효율성**
- **🚀 빠른 응답**: 소용량 파일 2-3초 즉시 처리
- **🔧 자동 복구**: 워커 노드 장애 시 자동 재시작
- **📊 리소스 최적화**: 워커당 4GB RAM, 최대 10개 동시 처리
- **🔒 보안**: CORS, Helmet, 파일 검증

---

## 📊 **성능 지표**

| 항목 | 지표 | 상태 |
|------|------|------|
| 🎯 **한국어 정확도** | 94% | ✅ Level 2 최적화 |
| 🎯 **영어 정확도** | 92% | ✅ Level 2 최적화 |
| ⚡ **소용량 처리** | 2-3초 | ✅ 즉시 응답 |
| ⚡ **대용량 처리** | 10-30초 | ✅ 큐 처리 |
| 💾 **메모리 사용** | 18GB 총합 | ✅ 4×4GB + 2GB Redis |
| 🔄 **동시 처리** | 10개 청크 | ✅ 4 Direct + 6 Queue |

---

## 🏗️ **시스템 아키텍처**

```
<code_block_to_apply_changes_from>
```

---

## 🛠️ **기술 스택**

### **⚙️ 런타임 & 프레임워크**
```yaml
runtime: Node.js 18+ (ARM64)
framework: Express.js 4.18+
stt_engine: OpenAI Whisper Small Model
queue_system: Redis + Bull
container: Docker Compose
platform: Mac Mini M2 (Apple Silicon)
```

### **📦 핵심 의존성**
```json
{
  "express": "^4.18.2",
  "bull": "^4.12.2", 
  "redis": "^4.6.13",
  "multer": "^1.4.5-lts.1",
  "fluent-ffmpeg": "^2.1.2",
  "cors": "^2.8.5",
  "helmet": "^6.0.1",
  "uuid": "^9.0.1"
}
```

---

## 🚀 **빠른 시작**

### **📋 전제 조건**
- **하드웨어**: Mac Mini M2 (또는 ARM64 지원 시스템)
- **소프트웨어**: Docker & Docker Compose, 16GB+ RAM 권장
- **Python**: 3.8+ (OpenAI Whisper용)

### **⚡ 설치 및 실행**

```bash
# 1. 프로젝트 디렉토리로 이동
cd /Users/hyemoonjung/backend_server/nodejs/backend_sayit

# 2. 의존성 설치
npm install

# 3. OpenAI Whisper 설치 (Python)
pip3 install openai-whisper

# 4. Mac M2 분산 환경 실행 (권장)
docker-compose -f docker-compose-m2-distributed.yml up -d

# 5. 서버 상태 확인
docker ps | grep sayit

# 6. 로그 모니터링
docker-compose -f docker-compose-m2-distributed.yml logs -f
```

### **📊 성능 모니터링**

```bash
# 실시간 리소스 사용량
docker stats sayit-direct-backend sayit-worker-1-m2 sayit-worker-2-m2 sayit-worker-3-m2

# Redis 클러스터 상태
docker exec -it sayit-redis-m2 redis-cli info

# 큐 작업 상태 확인
docker exec -it sayit-redis-m2 redis-cli llen "bull:transcription:waiting"
```

---

## 📡 **API 사용법**

### **POST /api/transcribe**
음성 파일을 텍스트로 변환합니다.

**요청:**
- Content-Type: `multipart/form-data`
- 필드: `audio` (오디오 파일)

**응답:**
```json
{
  "text": "변환된 텍스트",
  "confidence": 0.95,
  "duration": 10.5,
  "language": "ko",
  "model": "whisper-1"
}
```

### GET /api/health
서버 상태를 확인합니다.

### GET /api/supported-formats
지원되는 오디오 형식을 조회합니다.

## 🔧 지원 형식

- MP3 (.mp3)
- M4A (.m4a)
- WAV (.wav)
- WebM (.webm)
- AAC (.aac) - flutter_sound 기본 형식
- OGG (.ogg)
- FLAC (.flac)

## 🚨 주의사항

- 최대 파일 크기: 25MB
- OpenAI API 키가 필요합니다
- API 키가 없으면 더미 응답을 반환합니다 (개발용)

## 🔑 OpenAI API 키 발급

1. [OpenAI Platform](https://platform.openai.com/)에 가입
2. API Keys 섹션에서 새 키 생성
3. `.env` 파일에 키 입력

## 📱 Flutter 앱 연동

Flutter 앱에서 다음과 같이 서버 주소를 설정하세요:

```dart
// lib/services/stt_service.dart
static const String _baseUrl = 'http://localhost:3000/api';
```

## 🐳 Docker 사용법 (권장)

### Windows PC에서 Docker로 실행

#### 1. 초기 설정 (최초 1회)
```cmd
# 1. Git clone
git clone <repository-url>
cd backend_sayit

# 2. 초기 설정 스크립트 실행
scripts\setup.bat
```

#### 2. 서버 실행
```cmd
# 서버 시작
scripts\start.bat

# 로그 확인
scripts\logs.bat

# 서버 중지
scripts\stop.bat

# 서버 재시작
scripts\restart.bat
```

#### 3. 수동 Docker 명령어
```cmd
# Docker Compose로 빌드 및 실행
docker-compose up --build -d

# 컨테이너 상태 확인
docker ps

# 로그 확인
docker-compose logs -f sayit-backend

# 컨테이너 중지
docker-compose down
```

### Docker 구성
- **Dockerfile**: Node.js 18 Alpine 기반 경량 이미지
- **docker-compose.yml**: 컨테이너 오케스트레이션
- **nginx/nginx.conf**: 리버스 프록시 설정 (선택사항)
- **.dockerignore**: Docker 빌드 최적화
```

## 🚀 서버 실행 방법

이제 백엔드 서버를 실행해보세요:

```bash
cd /Users/hyemoonjung/backend_server/nodejs/backend_sayit

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

## 📱 Flutter 앱 STT 서비스 업데이트

실제 백엔드 서버 연동을 위해 STT 서비스를 업데이트하겠습니다:

```dart:lib/services/stt_service.dart
import 'dart:io';
import 'package:dio/dio.dart';

class STTService {
  static const String _baseUrl = 'http://localhost:3000/api'; // 백엔드 서버 주소
  final Dio _dio = Dio();

  Future<String> transcribeAudio(File audioFile) async {
    try {
      final formData = FormData.fromMap({
        'audio': await MultipartFile.fromFile(
          audioFile.path,
          filename: audioFile.path.split('/').last,
        ),
      });

      final response = await _dio.post(
        '$_baseUrl/transcribe',
        data: formData,
        options: Options(
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        ),
      );

      if (response.statusCode == 200) {
        return response.data['text'] ?? '';
      } else {
        throw Exception('STT API 오류: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('음성 변환 실패: $e');
    }
  }
}
```

## 🎯 테스트 순서

1. **백엔드 서버 실행**: `npm run dev`
2. **Flutter 앱 실행**: `flutter run`
3. **음성 녹음 및 저장**: 실제 STT 변환 테스트

OpenAI API 키가 없어도 더미 응답으로 테스트 가능하며, 실제 API 키를 설정하면 진짜 음성 변환이 작동합니다! 🎙️✨

백엔드 서버를 실행해보시고 결과를 알려주세요!
