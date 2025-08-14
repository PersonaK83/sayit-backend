# SayIt 백엔드 서버

Flutter SayIt 앱을 위한 STT(Speech-to-Text) 백엔드 서버입니다.

## 🚀 기능

- **음성 파일 업로드**: 다양한 오디오 형식 지원
- **STT 변환**: OpenAI Whisper API를 사용한 고품질 음성-텍스트 변환
- **한국어 최적화**: 한국어 음성 인식에 특화
- **보안**: CORS, Helmet 등 보안 미들웨어 적용

## 📋 요구사항

- Node.js 18.0.0 이상
- OpenAI API 키

## 🛠️ 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env` 파일을 생성하고 다음 내용을 입력하세요:

```env
OPENAI_API_KEY=your_actual_openai_api_key_here
PORT=3000
NODE_ENV=development
```

### 3. 서버 실행

#### 개발 환경
```bash
npm run dev
```

#### 프로덕션 환경
```bash
npm start
```

## 📡 API 엔드포인트

### POST /api/transcribe
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
