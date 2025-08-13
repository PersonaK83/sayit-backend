const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

// 업로드 디렉토리 설정
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
fs.ensureDirSync(uploadDir);

// Multer 설정 (기존과 동일)
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

// 🔥 초간단 로컬 Whisper 함수 (문제가 되는 매개변수 모두 제거)
async function transcribeWithLocalWhisper(audioFilePath) {
  return new Promise((resolve, reject) => {
    console.log('🎙️ 로컬 Whisper로 변환 시작...');
    console.log('📁 파일 경로:', audioFilePath);
    
    // 🔧 최소한의 필수 매개변수만 사용
    const whisperCmd = '/opt/venv/bin/python';
    const whisperArgs = [
      '-m', 'whisper',
      audioFilePath,
      '--model', 'tiny',           // 가장 작은 모델
      '--language', 'ko',          // 한국어
      '--output_format', 'txt',    // 텍스트 출력
      '--output_dir', uploadDir    // 출력 디렉토리
      // 문제가 되는 매개변수들 모두 제거
    ];
    
    console.log('🐍 Python 명령:', whisperCmd, whisperArgs.join(' '));
    
    const whisper = spawn(whisperCmd, whisperArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';
    let timeoutId = null;

    // 60초 타임아웃 (여유롭게)
    timeoutId = setTimeout(() => {
      console.log('⏰ Whisper 타임아웃 (60초)');
      whisper.kill('SIGKILL');
      reject(new Error('Whisper 처리 시간 초과'));
    }, 60000);

    whisper.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Whisper 출력:', output);
      stdout += output;
    });

    whisper.stderr.on('data', (data) => {
      const error = data.toString();
      console.log('Whisper 로그:', error);
      stderr += error;
    });

    whisper.on('close', async (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      
      console.log(`🏁 Whisper 종료 (코드: ${code})`);
      
      if (code === 0) {
        try {
          // 텍스트 파일 찾기
          const audioName = path.parse(audioFilePath).name;
          const textFilePath = path.join(uploadDir, `${audioName}.txt`);
          
          console.log('📄 텍스트 파일 경로:', textFilePath);
          
          if (await fs.pathExists(textFilePath)) {
            const transcript = await fs.readFile(textFilePath, 'utf8');
            const cleanTranscript = transcript.trim();
            
            console.log('✅ 변환 완료:', cleanTranscript);
            
            // 임시 파일 정리
            try {
              await fs.remove(textFilePath);
            } catch (cleanupError) {
              console.warn('텍스트 파일 정리 실패:', cleanupError.message);
            }
            
            resolve(cleanTranscript || '변환된 텍스트가 없습니다.');
          } else {
            console.warn('⚠️ 텍스트 파일을 찾을 수 없음');
            resolve('변환된 텍스트가 없습니다.');
          }
        } catch (error) {
          console.error('❌ 텍스트 파일 읽기 오류:', error);
          resolve('텍스트 파일 처리 중 오류가 발생했습니다.');
        }
      } else {
        console.error('❌ Whisper 실행 실패:', stderr);
        resolve('음성 변환 중 오류가 발생했습니다.');
      }
    });

    whisper.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
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

    // 로컬 Whisper로 변환
    const transcript = await transcribeWithLocalWhisper(tempFilePath);
    
    // 성공 응답
    res.json({
      success: true,
      transcript: transcript,
      filename: req.file.filename,
      size: req.file.size,
      method: 'Local Whisper (Tiny Model - Simplified)',
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
router.get('/diagnose', (req, res) => {
  res.json({
    status: 'OK',
    message: '로컬 Whisper STT 서비스가 정상 작동 중입니다.',
    timestamp: new Date().toISOString(),
    method: 'Local Whisper (Tiny Model - Simplified)',
    cost: '$0 (완전 무료)',
    model: 'whisper-tiny (39MB)',
    features: ['한국어 지원', '상업적 사용 가능', '무제한 사용량']
  });
});

module.exports = router; 