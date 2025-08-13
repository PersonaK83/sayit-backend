const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');

const router = express.Router();

// 업로드 디렉토리 생성
const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
fs.ensureDirSync(uploadDir);

// Whisper 로컬 실행 함수 (Python 모듈 방식)
async function transcribeWithLocalWhisper(audioFilePath) {
  return new Promise((resolve, reject) => {
    console.log('🎙️ 로컬 Whisper로 변환 시작...');
    console.log('📁 파일 경로:', audioFilePath);
    
    // python3 -m whisper 명령어 실행
    const whisper = spawn('python3', [
      '-m', 'whisper',
      audioFilePath,
      '--language', 'ko',
      '--model', 'base',
      '--output_format', 'txt',
      '--output_dir', uploadDir,
      '--verbose', 'False'
    ]);

    let stdout = '';
    let stderr = '';

    whisper.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('Whisper 출력:', data.toString().trim());
    });

    whisper.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('Whisper 로그:', data.toString().trim());
    });

    whisper.on('close', async (code) => {
      console.log(`Whisper 프로세스 종료, 코드: ${code}`);
      
      if (code === 0) {
        try {
          // TXT 결과 파일 읽기
          const baseName = path.basename(audioFilePath, path.extname(audioFilePath));
          const txtPath = path.join(uploadDir, `${baseName}.txt`);
          
          console.log('📄 결과 파일 경로:', txtPath);
          
          if (fs.existsSync(txtPath)) {
            const text = await fs.readFile(txtPath, 'utf8');
            console.log('✅ Whisper 변환 완료:', text.trim());
            
            // 결과 파일 정리
            await fs.remove(txtPath);
            
            resolve({
              text: text.trim() || '변환된 텍스트가 없습니다.',
              language: 'ko',
              duration: 0
            });
          } else {
            console.log('❌ 결과 파일이 생성되지 않았습니다.');
            console.log('📂 업로드 디렉토리 내용:', fs.readdirSync(uploadDir));
            
            // stdout에서 텍스트 추출 시도
            const textMatch = stdout.match(/\[.*?\]\s*(.*?)$/m);
            if (textMatch && textMatch[1]) {
              resolve({
                text: textMatch[1].trim(),
                language: 'ko',
                duration: 0
              });
            } else {
              reject(new Error('Whisper 결과 파일을 찾을 수 없습니다.'));
            }
          }
        } catch (error) {
          console.error('결과 처리 오류:', error);
          reject(new Error(`결과 파싱 오류: ${error.message}`));
        }
      } else {
        console.error('Whisper 실행 실패:', stderr);
        reject(new Error(`Whisper 실행 실패 (코드: ${code}): ${stderr}`));
      }
    });

    whisper.on('error', (error) => {
      console.error('Whisper 프로세스 오류:', error);
      reject(new Error(`Whisper 실행 오류: ${error.message}`));
    });
  });
}

// Whisper 설치 확인 함수 (Python 모듈 방식)
async function checkWhisperInstallation() {
  return new Promise((resolve) => {
    console.log('🔍 Whisper 설치 확인 중...');
    
    const whisper = spawn('python3', ['-m', 'whisper', '--help']);
    
    whisper.on('close', (code) => {
      const isInstalled = code === 0;
      console.log(`Whisper 설치 상태: ${isInstalled ? '✅ 설치됨' : '❌ 미설치'}`);
      resolve(isInstalled);
    });
    
    whisper.on('error', (error) => {
      console.log('❌ Whisper 확인 오류:', error.message);
      resolve(false);
    });
  });
}

// Multer 설정 (WAV MIME 타입 추가)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname) || '.wav';
    cb(null, `audio-${uniqueSuffix}${extension}`);
  }
});

// fileFilter 부분에서 AAC 지원 확인
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // AAC와 WAV 모두 지원
    const allowedMimes = [
      'audio/mpeg',
      'audio/mp4', 
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/webm',
      'audio/aac',          // AAC 지원
      'audio/x-aac',        // AAC 추가 형식
      'audio/mp4a-latm',    // AAC 추가 형식
      'audio/ogg',
      'audio/flac',
      'audio/m4a'
    ];
    
    console.log(`📁 업로드 파일 정보:`, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    if (allowedMimes.includes(file.mimetype)) {
      console.log('✅ 파일 형식 허용됨:', file.mimetype);
      cb(null, true);
    } else {
      console.log('❌ 지원하지 않는 파일 형식:', file.mimetype);
      console.log('📋 허용되는 형식들:', allowedMimes);
      cb(new Error(`지원하지 않는 파일 형식입니다: ${file.mimetype}`), false);
    }
  }
});

// 진단 엔드포인트
router.get('/diagnose', async (req, res) => {
  console.log('🔍 시스템 진단 시작...');
  
  const diagnosis = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  // Whisper 설치 확인
  diagnosis.tests.whisperInstalled = await checkWhisperInstallation();
  
  // OpenAI API 키 확인
  diagnosis.tests.openaiApiKey = {
    configured: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here',
    format: process.env.OPENAI_API_KEY?.startsWith('sk-') || false
  };

  // 업로드 디렉토리 확인
  diagnosis.tests.uploadDirectory = {
    exists: fs.existsSync(uploadDir),
    path: uploadDir,
    writable: true
  };

  // 지원되는 파일 형식 정보 추가
  diagnosis.supportedMimeTypes = [
    'audio/mpeg',
    'audio/mp4', 
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/webm',
    'audio/aac',
    'audio/ogg',
    'audio/flac',
    'audio/m4a'
  ];

  // 사용할 STT 방식 결정
  if (diagnosis.tests.whisperInstalled) {
    diagnosis.sttMethod = 'local-whisper';
    diagnosis.status = '✅ 로컬 Whisper 사용 가능 (무료)';
  } else if (diagnosis.tests.openaiApiKey.configured) {
    diagnosis.sttMethod = 'openai-api';
    diagnosis.status = '⚠️ OpenAI API 사용 (유료 - 할당량 확인 필요)';
  } else {
    diagnosis.sttMethod = 'dummy';
    diagnosis.status = '🔧 더미 모드 (테스트용)';
  }

  console.log('📋 진단 결과:', diagnosis);
  res.json(diagnosis);
});

// STT 변환 엔드포인트
router.post('/transcribe', (req, res, next) => {
  console.log('🎯 /api/transcribe 요청 수신됨');
  console.log('📍 클라이언트 IP:', req.ip);
  console.log('⏰ 요청 시간:', new Date().toISOString());
  next();
}, upload.single('audio'), async (req, res) => {
  let tempFilePath = null;
  
  try {
    console.log('📤 파일 업로드 처리 시작');
    
    if (!req.file) {
      return res.status(400).json({
        error: '오디오 파일이 업로드되지 않았습니다.',
        code: 'NO_FILE_UPLOADED'
      });
    }

    tempFilePath = req.file.path;
    
    console.log(`📁 파일 업로드 완료:`, {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    // 1순위: 로컬 Whisper 사용 (무료)
    const whisperInstalled = await checkWhisperInstallation();
    
    if (whisperInstalled) {
      console.log('🆓 로컬 Whisper 사용');
      
      const result = await transcribeWithLocalWhisper(tempFilePath);
      
      // 파일 정리
      await fs.remove(tempFilePath);
      console.log('🗑️ 임시 파일 삭제됨');
      
      const response = {
        text: result.text,
        confidence: 0.95,
        duration: result.duration,
        language: result.language,
        model: 'whisper-local-base',
        method: 'local-whisper',
        cost: 'free',
        inputFormat: req.file.mimetype
      };
      
      console.log('✅ 로컬 Whisper 변환 완료:', response);
      return res.json(response);
    }

    // 2순위: 더미 응답
    console.log('🔧 더미 모드 사용 (Whisper 미설치)');
    
    await fs.remove(tempFilePath);
    console.log('🗑️ 임시 파일 삭제됨');
    
    const dummyResponse = {
      text: `🎙️ 더미 STT 변환 결과입니다! 파일: "${req.file.originalname}" (${req.file.size} bytes, ${req.file.mimetype})`,
      confidence: 0.95,
      duration: Math.random() * 10 + 5,
      language: 'ko',
      model: 'dummy',
      method: 'dummy',
      cost: 'free',
      inputFormat: req.file.mimetype
    };
    
    console.log('✅ 더미 응답 반환:', dummyResponse);
    return res.json(dummyResponse);

  } catch (error) {
    console.error('❌ STT 변환 오류:', error.message);
    
    // 파일 정리
    if (tempFilePath) {
      try {
        await fs.remove(tempFilePath);
        console.log('🗑️ 오류 발생으로 임시 파일 삭제됨');
      } catch (cleanupError) {
        console.error('파일 정리 오류:', cleanupError);
      }
    }

    res.status(500).json({
      error: '음성 변환 중 오류가 발생했습니다.',
      code: 'TRANSCRIPTION_ERROR',
      details: error.message
    });
  }
});

module.exports = router; 