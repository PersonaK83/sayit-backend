const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

// 업로드 디렉토리 설정
const uploadDir = process.env.UPLOAD_DIR || 'uploads';

// 업로드 디렉토리가 없으면 생성
fs.ensureDirSync(uploadDir);

// Whisper 로컬 실행 함수 (Docker 가상환경 지원)
async function transcribeWithLocalWhisper(audioFilePath) {
  return new Promise((resolve, reject) => {
    console.log('🎙️ 로컬 Whisper로 변환 시작...');
    console.log('📁 파일 경로:', audioFilePath);
    
    // Docker 환경에서는 가상환경의 python을 사용
    const pythonCmd = process.env.NODE_ENV === 'production' 
      ? '/opt/venv/bin/python'  // Docker 가상환경 경로
      : 'python3';              // 로컬 개발 환경
    
    console.log('🐍 Python 경로:', pythonCmd);
    
    // python -m whisper 명령어 실행
    const whisper = spawn(pythonCmd, [
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
              text: text.trim(),
              language: 'ko',
              duration: 0
            });
          } else {
            console.log('❌ 결과 파일을 찾을 수 없음:', txtPath);
            reject(new Error('Whisper 결과 파일을 찾을 수 없습니다.'));
          }
        } catch (error) {
          console.log('❌ 결과 파일 읽기 오류:', error);
          reject(error);
        }
      } else {
        console.log('❌ Whisper 실행 실패:', stderr);
        reject(new Error(`Whisper 실행 실패: ${stderr}`));
      }
    });

    whisper.on('error', (error) => {
      console.log('❌ Whisper 프로세스 오류:', error);
      reject(error);
    });
  });
}

// Whisper 설치 확인 함수 (Docker 가상환경 지원)
async function checkWhisperInstallation() {
  return new Promise((resolve) => {
    console.log('🔍 Whisper 설치 확인 중...');
    
    // Docker 환경에서는 가상환경의 python을 사용
    const pythonCmd = process.env.NODE_ENV === 'production' 
      ? '/opt/venv/bin/python'  // Docker 가상환경 경로
      : 'python3';              // 로컬 개발 환경
    
    const check = spawn(pythonCmd, ['-c', 'import whisper; print("installed")']);
    
    let output = '';
    
    check.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    check.on('close', (code) => {
      const isInstalled = code === 0 && output.includes('installed');
      console.log(`🔍 Whisper 설치 상태: ${isInstalled ? '설치됨' : '설치되지 않음'}`);
      resolve(isInstalled);
    });
    
    check.on('error', (error) => {
      console.log('❌ Whisper 확인 오류:', error);
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
      'audio/opus',
      'audio/flac',
      'audio/x-flac'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`지원하지 않는 파일 형식입니다: ${file.mimetype}`));
    }
  }
});

// 네트워크 진단 엔드포인트
router.get('/diagnose', async (req, res) => {
  try {
    const diagnostics = {
      server: '정상',
      timestamp: new Date().toISOString(),
      whisper: await checkWhisperInstallation() ? '설치됨' : '설치되지 않음',
      uploadDir: {
        exists: fs.existsSync(uploadDir),
        path: uploadDir
      },
      environment: process.env.NODE_ENV || 'development',
      python: process.env.NODE_ENV === 'production' 
        ? '/opt/venv/bin/python'  // Docker 가상환경 경로
        : 'python3'               // 로컬 개발 환경
    };
    
    res.json(diagnostics);
  } catch (error) {
    res.status(500).json({
      error: '진단 중 오류 발생',
      details: error.message
    });
  }
});

// STT 변환 엔드포인트
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  let tempFilePath = null;
  
  try {
    console.log('\n🎤 === STT 변환 요청 시작 ===');
    console.log('📅 시간:', new Date().toISOString());
    
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
    } else {
      // Whisper가 설치되지 않은 경우 더미 응답
      console.log('⚠️ Whisper가 설치되지 않음. 더미 응답 반환');
      
      await fs.remove(tempFilePath);
      
      return res.json({
        text: '음성을 텍스트로 변환했습니다. (더미 데이터)',
        confidence: 0.8,
        duration: 5.0,
        language: 'ko',
        model: 'dummy',
        method: 'fallback',
        cost: 'free',
        inputFormat: req.file.mimetype
      });
    }

  } catch (error) {
    console.error('❌ STT 변환 오류:', error);
    
    // 임시 파일 정리
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.remove(tempFilePath);
        console.log('🗑️ 오류 발생 시 임시 파일 삭제됨');
      } catch (cleanupError) {
        console.error('❌ 파일 정리 실패:', cleanupError);
      }
    }
    
    res.status(500).json({
      error: '음성 변환 중 오류가 발생했습니다.',
      details: error.message,
      code: 'TRANSCRIPTION_ERROR'
    });
  }
});

module.exports = router; 