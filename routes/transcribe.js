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
    fileSize: 25 * 1024 * 1024,
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

// ✅ 완전히 간단한 Whisper 실행 (문제 매개변수 완전 제거)
async function transcribeWithLocalWhisper(audioFilePath) {
  return new Promise((resolve, reject) => {
    console.log('🎙️ === 간단한 로컬 Whisper 시작 ===');
    console.log('📁 파일:', audioFilePath);
    
    // 🔥 최소 필수 매개변수만 사용 (문제 매개변수 완전 제거)
    const whisperArgs = [
      '-m', 'whisper',
      audioFilePath,
      '--model', 'tiny',
      '--language', 'ko',
      '--output_format', 'txt',
      '--output_dir', uploadDir
    ];
    
    console.log('🚀 실행 명령:', '/opt/venv/bin/python', whisperArgs.join(' '));
    
    const whisper = spawn('/opt/venv/bin/python', whisperArgs);
    
    let stderr = '';
    
    whisper.stdout.on('data', (data) => {
      console.log('📤 Whisper 출력:', data.toString());
    });

    whisper.stderr.on('data', (data) => {
      const log = data.toString();
      console.log('📋 Whisper 로그:', log);
      stderr += log;
    });

    whisper.on('close', async (code) => {
      console.log(`🏁 Whisper 완료 (코드: ${code})`);
      
      if (code === 0) {
        try {
          const audioName = path.parse(audioFilePath).name;
          const textFilePath = path.join(uploadDir, `${audioName}.txt`);
          
          if (await fs.pathExists(textFilePath)) {
            const transcript = await fs.readFile(textFilePath, 'utf8');
            const result = transcript.trim();
            
            console.log('✅ 변환 성공:', result);
            
            await fs.remove(textFilePath).catch(() => {});
            resolve(result || '변환된 텍스트가 없습니다.');
          } else {
            console.log('⚠️ 텍스트 파일 없음');
            resolve('변환된 텍스트가 없습니다.');
          }
        } catch (error) {
          console.error('❌ 파일 처리 오류:', error);
          resolve('파일 처리 중 오류가 발생했습니다.');
        }
      } else {
        console.error('❌ Whisper 실패:', stderr);
        resolve('음성 변환에 실패했습니다.');
      }
    });

    whisper.on('error', (error) => {
      console.error('❌ 프로세스 오류:', error);
      resolve('Whisper 실행 오류가 발생했습니다.');
    });
  });
}

// STT 엔드포인트
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  let tempFilePath = null;
  
  try {
    console.log('\n🎤 === STT 변환 시작 ===');
    
    if (!req.file) {
      return res.status(400).json({
        error: '오디오 파일이 없습니다.',
        code: 'NO_FILE'
      });
    }

    tempFilePath = req.file.path;
    
    console.log('📁 업로드 완료:', {
      size: req.file.size,
      type: req.file.mimetype,
      path: req.file.path
    });

    const transcript = await transcribeWithLocalWhisper(tempFilePath);
    
    res.json({
      success: true,
      transcript: transcript,
      method: 'Local Whisper Tiny (Simplified)',
      timestamp: new Date().toISOString()
    });

    console.log('🎉 STT 성공:', transcript);

  } catch (error) {
    console.error('❌ STT 오류:', error);
    res.status(500).json({
      error: '변환 중 오류가 발생했습니다.',
      details: error.message
    });
  } finally {
    if (tempFilePath) {
      fs.remove(tempFilePath).catch(() => {});
    }
  }
});

router.get('/diagnose', (req, res) => {
  res.json({
    status: 'OK',
    message: '로컬 Whisper (간단 버전) 준비 완료',
    method: 'Simplified Local Whisper',
    cost: '$0'
  });
});

module.exports = router; 