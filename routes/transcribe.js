const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

// 업로드 디렉토리 설정
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
fs.ensureDirSync(uploadDir);

// Multer 설정
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

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav',
      'audio/wave', 'audio/webm', 'audio/aac', 'audio/x-aac',
      'audio/mp4a-latm', 'audio/ogg', 'audio/opus', 'audio/flac'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`지원하지 않는 파일 형식입니다: ${file.mimetype}`));
    }
  }
});

// 로컬 Whisper 설치 확인
function checkWhisperInstallation() {
  return new Promise((resolve) => {
    const python = spawn('python3', ['-c', 'import whisper; print("installed")']);
    
    python.on('close', (code) => {
      resolve(code === 0);
    });
    
    python.on('error', () => {
      resolve(false);
    });
  });
}

// 로컬 Whisper로 변환
async function transcribeWithLocalWhisper(audioFilePath) {
  return new Promise((resolve, reject) => {
    console.log('🎙️ 로컬 Whisper로 변환 시작...');
    console.log('📁 파일 경로:', audioFilePath);
    
    // python3 -m whisper 명령어 사용
    const python = spawn('python3', [
      '-m', 'whisper',
      audioFilePath,
      '--model', 'base',  // 또는 'small', 'medium' 등
      '--language', 'ko',
      '--output_format', 'txt',
      '--output_dir', uploadDir
    ]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Whisper 출력:', output);
      stdout += output;
    });

    python.stderr.on('data', (data) => {
      const error = data.toString();
      console.log('Whisper 로그:', error);
      stderr += error;
    });

    python.on('close', async (code) => {
      console.log(`🏁 Whisper 종료 (코드: ${code})`);
      
      if (code === 0) {
        try {
          // 변환된 텍스트 파일 읽기
          const audioName = path.parse(audioFilePath).name;
          const textFilePath = path.join(uploadDir, `${audioName}.txt`);
          
          if (await fs.pathExists(textFilePath)) {
            const transcript = await fs.readFile(textFilePath, 'utf8');
            const cleanTranscript = transcript.trim();
            
            console.log('✅ 변환 완료:', cleanTranscript);
            
            // 텍스트 파일 삭제
            await fs.remove(textFilePath);
            
            resolve(cleanTranscript || '변환된 텍스트가 없습니다.');
          } else {
            console.warn('⚠️ 텍스트 파일을 찾을 수 없음');
            resolve('변환된 텍스트가 없습니다.');
          }
        } catch (error) {
          console.error('❌ 텍스트 파일 처리 오류:', error);
          resolve('텍스트 파일 처리 중 오류가 발생했습니다.');
        }
      } else {
        console.error('❌ Whisper 실행 실패:', stderr);
        resolve('음성 변환 중 오류가 발생했습니다.');
      }
    });

    python.on('error', (error) => {
      console.error('❌ Whisper 프로세스 오류:', error);
      resolve('Whisper 실행 중 오류가 발생했습니다.');
    });
  });
}

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

    // Whisper 설치 확인
    console.log('🔍 Whisper 설치 확인 중...');
    const whisperInstalled = await checkWhisperInstallation();
    console.log('🔍 Whisper 설치 상태:', whisperInstalled ? '설치됨' : '설치되지 않음');

    let transcript;
    if (whisperInstalled) {
      console.log('🆓 로컬 Whisper 사용');
      transcript = await transcribeWithLocalWhisper(tempFilePath);
    } else {
      console.log('⚠️ Whisper가 설치되지 않았습니다. 더미 응답 반환');
      transcript = '로컬 Whisper가 설치되지 않았습니다. 실제 음성 변환을 위해 Whisper를 설치해주세요.';
    }
    
    // 성공 응답
    res.json({
      success: true,
      transcript: transcript,
      filename: req.file.filename,
      size: req.file.size,
      method: whisperInstalled ? 'Local Whisper' : 'Dummy Response',
      whisperInstalled: whisperInstalled,
      timestamp: new Date().toISOString()
    });

    console.log('🎉 STT 변환 성공!');
    console.log('📝 변환 결과:', transcript);

  } catch (error) {
    console.error('❌ STT 변환 실패:', error);
    
    res.status(500).json({
      error: '음성 변환 중 오류가 발생했습니다.',
      details: error.message,
      code: 'TRANSCRIPTION_FAILED'
    });
  } finally {
    // 임시 파일 정리
    if (tempFilePath) {
      try {
        await fs.remove(tempFilePath);
        console.log('🧹 임시 파일 삭제 완료');
      } catch (cleanupError) {
        console.error('임시 파일 삭제 실패:', cleanupError.message);
      }
    }
  }
});

// 진단 엔드포인트
router.get('/diagnose', async (req, res) => {
  const whisperInstalled = await checkWhisperInstallation();
  
  res.json({
    status: 'OK',
    message: '로컬 STT 서비스가 정상 작동 중입니다.',
    timestamp: new Date().toISOString(),
    whisperInstalled: whisperInstalled,
    method: whisperInstalled ? 'Local Whisper' : 'Dummy Response',
    recommendation: whisperInstalled ? 
      '로컬 Whisper가 설치되어 실제 음성 변환이 가능합니다.' : 
      'pip3 install openai-whisper 명령어로 Whisper를 설치해주세요.'
  });
});

module.exports = router; 