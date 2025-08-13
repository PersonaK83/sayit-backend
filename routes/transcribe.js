const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');

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

// 🆕 극도로 최적화된 Web Speech API 함수
async function transcribeWithWebSpeechAPI(audioFilePath) {
  let browser = null;
  
  try {
    console.log('🎙️ Web Speech API 변환 시작...');
    console.log('📁 파일 경로:', audioFilePath);
    
    // 🔧 메모리 최적화된 Puppeteer 설정
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',        // /dev/shm 사용 안함
        '--disable-accelerated-2d-canvas', // 2D 캔버스 가속 비활성화
        '--disable-gpu',                  // GPU 사용 안함
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',          // 메모리 압박 모니터링 비활성화
        '--max_old_space_size=256',       // 힙 메모리 256MB 제한
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',               // 이미지 로딩 비활성화
        '--disable-javascript-harmony-shipping',
        '--disable-background-networking',
        '--single-process'                // 단일 프로세스로 실행
      ],
      timeout: 15000  // 15초 타임아웃
    });

    const page = await browser.newPage();
    
    // 메모리 사용량 최소화 설정
    await page.setViewport({ width: 800, height: 600 });
    await page.setJavaScriptEnabled(true);
    
    // 불필요한 리소스 차단
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Web Speech API HTML 페이지 생성
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>STT</title>
    </head>
    <body>
        <audio id="audioPlayer" controls style="display:none;"></audio>
        <div id="result"></div>
        
        <script>
        let recognition = null;
        let isRecognitionActive = false;
        
        // Web Speech API 초기화
        function initializeSpeechRecognition() {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                throw new Error('Web Speech API not supported');
            }
            
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'ko-KR';
            recognition.maxAlternatives = 1;
            
            return new Promise((resolve, reject) => {
                let finalTranscript = '';
                let timeoutId = null;
                
                recognition.onstart = () => {
                    console.log('🎤 음성 인식 시작');
                    isRecognitionActive = true;
                    // 30초 타임아웃 설정
                    timeoutId = setTimeout(() => {
                        if (isRecognitionActive) {
                            recognition.stop();
                            resolve(finalTranscript || '변환된 텍스트가 없습니다.');
                        }
                    }, 30000);
                };
                
                recognition.onresult = (event) => {
                    console.log('📝 결과 수신:', event.results.length);
                    
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const result = event.results[i];
                        if (result.isFinal) {
                            finalTranscript += result[0].transcript + ' ';
                            console.log('✅ 최종 결과:', result[0].transcript);
                        }
                    }
                };
                
                recognition.onerror = (event) => {
                    console.error('❌ 인식 오류:', event.error);
                    isRecognitionActive = false;
                    if (timeoutId) clearTimeout(timeoutId);
                    
                    // 오류가 있어도 부분 결과라도 반환
                    resolve(finalTranscript || '음성 인식 중 오류가 발생했습니다.');
                };
                
                recognition.onend = () => {
                    console.log('🏁 음성 인식 종료');
                    isRecognitionActive = false;
                    if (timeoutId) clearTimeout(timeoutId);
                    resolve(finalTranscript || '변환된 텍스트가 없습니다.');
                };
            });
        }
        
        // 오디오 파일 재생 및 인식
        async function processAudioFile(base64Data) {
            try {
                const audioPlayer = document.getElementById('audioPlayer');
                audioPlayer.src = 'data:audio/wav;base64,' + base64Data;
                
                // 오디오 로드 대기
                await new Promise((resolve, reject) => {
                    audioPlayer.onloadeddata = resolve;
                    audioPlayer.onerror = reject;
                    audioPlayer.load();
                });
                
                console.log('🔊 오디오 파일 로드 완료');
                
                // 음성 인식 초기화
                const transcriptPromise = initializeSpeechRecognition();
                
                // 오디오 재생 시작
                audioPlayer.play();
                recognition.start();
                
                // 결과 대기
                const transcript = await transcriptPromise;
                
                console.log('📋 최종 변환 결과:', transcript);
                document.getElementById('result').textContent = transcript;
                
                return transcript;
                
            } catch (error) {
                console.error('처리 오류:', error);
                return '오디오 처리 중 오류가 발생했습니다.';
            }
        }
        
        // 전역 함수로 노출
        window.processAudioFile = processAudioFile;
        </script>
    </body>
    </html>`;

    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

    // 오디오 파일을 Base64로 변환
    const audioBuffer = await fs.readFile(audioFilePath);
    const base64Audio = audioBuffer.toString('base64');
    
    console.log('📊 오디오 파일 크기:', audioBuffer.length, 'bytes');

    // Web Speech API로 변환 실행
    const transcript = await page.evaluate(async (base64Data) => {
      return await window.processAudioFile(base64Data);
    }, base64Audio);

    console.log('✅ 변환 완료:', transcript);
    return transcript;

  } catch (error) {
    console.error('❌ Web Speech API 오류:', error.message);
    return '음성 변환 중 오류가 발생했습니다.';
  } finally {
    // 브라우저 정리
    if (browser) {
      try {
        await browser.close();
        console.log('🧹 브라우저 정리 완료');
      } catch (closeError) {
        console.error('브라우저 종료 오류:', closeError.message);
      }
    }
  }
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

    // Web Speech API로 변환
    const transcript = await transcribeWithWebSpeechAPI(tempFilePath);
    
    // 성공 응답
    res.json({
      success: true,
      transcript: transcript,
      filename: req.file.filename,
      size: req.file.size,
      method: 'Web Speech API',
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
    message: 'Web Speech API STT 서비스가 정상 작동 중입니다.',
    timestamp: new Date().toISOString(),
    method: 'Web Speech API',
    puppeteer: 'installed'
  });
});

module.exports = router; 