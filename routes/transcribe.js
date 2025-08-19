const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

// ✅ 작업 상태 관리 (메모리 기반)
const transcriptionJobs = new Map();

// 작업 상태 enum
const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing', 
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// 작업 정리 (24시간 후 자동 삭제)
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of transcriptionJobs.entries()) {
    if (now - job.createdAt > 24 * 60 * 60 * 1000) { // 24시간
      console.log(`🧹 만료된 작업 삭제: ${jobId}`);
      transcriptionJobs.delete(jobId);
    }
  }
}, 60 * 60 * 1000); // 1시간마다 정리

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

// ✅ 비동기 Whisper 변환 (자동 언어 감지 지원)
async function transcribeWithLocalWhisperAsync(audioFilePath, jobId, language = 'auto') {
  return new Promise((resolve) => {
    console.log(`🎙️ 비동기 Whisper 변환 시작 [${jobId}]...`);
    console.log('📁 파일 경로:', audioFilePath);
    console.log('🌐 언어 설정:', language);
    
    // 작업 상태 업데이트: 처리 중
    const job = transcriptionJobs.get(jobId);
    if (job) {
      job.status = JobStatus.PROCESSING;
      job.startedAt = Date.now();
      transcriptionJobs.set(jobId, job);
    }
    
    // ✅ 환경 변수로 경고 메시지 숨기기
    const env = { 
      ...process.env, 
      PYTHONWARNINGS: 'ignore::UserWarning'
    };
    
    // Whisper 명령어 구성
    const whisperArgs = [
      '-m', 'whisper',
      audioFilePath,
      '--model', 'base',
      '--output_format', 'txt',
      '--output_dir', uploadDir,
      '--verbose', 'False'
    ];
    
    // ✅ 언어 모드별 처리
    if (language === 'auto') {
      console.log('🔍 자동 언어 감지 모드 (혼합 언어 지원)');
      // --language 옵션을 추가하지 않으면 Whisper가 자동으로 언어 감지
    } else if (language === 'mixed') {
      console.log('🌐 혼합 언어 전용 모드 (실험적)');
      // 혼합 언어에 최적화된 설정
      whisperArgs.push('--task', 'transcribe');
    } else {
      // 기존 단일 언어 모드
      whisperArgs.push('--language', language);
      console.log(`🎯 단일 언어 모드: ${language}`);
    }
    
    console.log('🔧 Whisper 실행 명령어:', whisperArgs.join(' '));
    
    const python = spawn('python3', whisperArgs, { env });

    let stdout = '';
    let stderr = '';
    let hasOutput = false;

    python.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Whisper 출력 [${jobId}]:`, output);
      stdout += output;
      hasOutput = true;
      
      // 진행률 업데이트 (간단한 추정)
      const job = transcriptionJobs.get(jobId);
      if (job && job.status === JobStatus.PROCESSING) {
        job.progress = Math.min(job.progress + 0.1, 0.9);
        transcriptionJobs.set(jobId, job);
      }
    });

    python.stderr.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('UserWarning') && !error.includes('FP16')) {
        console.log(`Whisper 로그 [${jobId}]:`, error);
      }
      stderr += error;
    });

    python.on('close', async (code) => {
      console.log(`Whisper 프로세스 종료 [${jobId}] 코드: ${code}`);
      
      const job = transcriptionJobs.get(jobId);
      if (!job) {
        console.log(`❌ 작업을 찾을 수 없음: ${jobId}`);
        resolve({ success: false, error: '작업을 찾을 수 없습니다' });
        return;
      }

      if (code === 0 && hasOutput) {
        try {
          // 결과 파일 읽기
          const audioFileName = path.parse(audioFilePath).name;
          const resultFilePath = path.join(uploadDir, `${audioFileName}.txt`);
          
          if (await fs.pathExists(resultFilePath)) {
            const transcribedText = await fs.readFile(resultFilePath, 'utf8');
            const cleanedText = transcribedText.trim();
            
            console.log(`✅ Whisper 변환 완료 [${jobId}]:`, cleanedText);
            
            // 작업 완료 상태 업데이트
            job.status = JobStatus.COMPLETED;
            job.result = cleanedText;
            job.completedAt = Date.now();
            job.progress = 1.0;
            transcriptionJobs.set(jobId, job);
            
            // 임시 파일 정리
            try {
              await fs.remove(audioFilePath);
              await fs.remove(resultFilePath);
              console.log(`🧹 임시 파일 정리 완료 [${jobId}]`);
            } catch (cleanupError) {
              console.log(`⚠️ 파일 정리 실패 [${jobId}]:`, cleanupError.message);
            }
            
            resolve({ success: true, text: cleanedText });
          } else {
            throw new Error('결과 파일을 찾을 수 없습니다');
          }
        } catch (error) {
          console.log(`❌ 결과 처리 실패 [${jobId}]:`, error.message);
          job.status = JobStatus.FAILED;
          job.error = error.message;
          transcriptionJobs.set(jobId, job);
          resolve({ success: false, error: error.message });
        }
      } else {
        // 실패 처리
        const errorMessage = stderr || `Whisper 프로세스 실패 (코드: ${code})`;
        console.log(`❌ Whisper 변환 실패 [${jobId}]:`, errorMessage);
        
        job.status = JobStatus.FAILED;
        job.error = errorMessage;
        transcriptionJobs.set(jobId, job);
        
        resolve({ success: false, error: errorMessage });
      }
    });

    python.on('error', (error) => {
      console.log(`❌ Whisper 프로세스 에러 [${jobId}]:`, error.message);
      
      const job = transcriptionJobs.get(jobId);
      if (job) {
        job.status = JobStatus.FAILED;
        job.error = error.message;
        transcriptionJobs.set(jobId, job);
      }
      
      resolve({ success: false, error: error.message });
    });
  });
}

// 동기식 Whisper 변환 (기존 방식, 짧은 파일용)
async function transcribeWithLocalWhisper(audioFilePath) {
  return new Promise((resolve, reject) => {
    console.log('🎙️ 로컬 Whisper로 변환 시작...');
    console.log('📁 파일 경로:', audioFilePath);
    
    const python = spawn('python3', [
      '-m', 'whisper',
      audioFilePath,
      '--model', 'base',
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
          const audioName = path.parse(audioFilePath).name;
          const textFilePath = path.join(uploadDir, `${audioName}.txt`);
          
          if (await fs.pathExists(textFilePath)) {
            const transcript = await fs.readFile(textFilePath, 'utf8');
            const cleanTranscript = transcript.trim();
            
            console.log('✅ 변환 완료:', cleanTranscript);
            
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

// ✅ STT 변환 엔드포인트 (폴링 지원)
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
    const language = req.body.language || 'ko';
    const isAsync = req.body.async === 'true';
    
    console.log(`📁 파일 업로드 완료:`, {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path,
      language: language,
      async: isAsync
    });

    // Whisper 설치 확인
    console.log('🔍 Whisper 설치 확인 중...');
    const whisperInstalled = await checkWhisperInstallation();
    console.log('🔍 Whisper 설치 상태:', whisperInstalled ? '설치됨' : '설치되지 않음');

    if (!whisperInstalled) {
      return res.status(500).json({
        error: 'Whisper가 설치되지 않았습니다.',
        code: 'WHISPER_NOT_INSTALLED'
      });
    }

    // ✅ 파일 크기 기반 처리 방식 결정
    const fileSizeThreshold = 100 * 1024; // 100KB 기준
    const shouldUseAsync = isAsync || req.file.size > fileSizeThreshold;

    if (shouldUseAsync) {
      // 🔄 비동기 처리 (큰 파일용)
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 작업 등록
      transcriptionJobs.set(jobId, {
        id: jobId,
        status: JobStatus.PENDING,
        originalFilename: req.file.originalname,
        filename: req.file.filename,
        filePath: tempFilePath,
        language: language,
        fileSize: req.file.size,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        transcript: null,
        error: null
      });
      
      console.log(`🔄 비동기 작업 등록: ${jobId}`);
      
      // 백그라운드에서 변환 실행
      transcribeWithLocalWhisperAsync(tempFilePath, jobId, language);
      
      // 즉시 jobId 반환
      res.json({
        success: true,
        jobId: jobId,
        status: JobStatus.PENDING,
        message: '변환 작업이 시작되었습니다. 상태를 확인하려면 /api/transcribe/status/{jobId}를 호출하세요.',
        estimatedTime: Math.ceil(req.file.size / (10 * 1024)) + 30 // 10KB당 1초 + 30초 기본
      });
      
    } else {
      // ⚡ 동기 처리 (작은 파일용)
      console.log('⚡ 동기 처리 모드 (작은 파일)');
      const transcript = await transcribeWithLocalWhisper(tempFilePath);
      
      // 성공 응답
      res.json({
        success: true,
        transcript: transcript,
        filename: req.file.filename,
        size: req.file.size,
        method: 'Local Whisper (Sync)',
        whisperInstalled: true,
        timestamp: new Date().toISOString()
      });

      console.log('🎉 STT 변환 성공!');
      console.log('📝 변환 결과:', transcript);
      
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

  } catch (error) {
    console.error('❌ STT 변환 실패:', error);
    
    res.status(500).json({
      error: '음성 변환 중 오류가 발생했습니다.',
      details: error.message,
      code: 'TRANSCRIPTION_FAILED'
    });
    
    // 동기 처리 시에만 임시 파일 정리 (비동기는 백그라운드에서 처리)
    if (tempFilePath && !req.body.async) {
      try {
        await fs.remove(tempFilePath);
        console.log('🧹 임시 파일 삭제 완료 (에러 처리)');
      } catch (cleanupError) {
        console.error('임시 파일 삭제 실패:', cleanupError.message);
      }
    }
  }
});

// ✅ 작업 상태 확인 엔드포인트
router.get('/transcribe/status/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = transcriptionJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({
      error: '작업을 찾을 수 없습니다.',
      jobId: jobId,
      code: 'JOB_NOT_FOUND'
    });
  }
  
  // 진행률 계산
  let progress = 0;
  if (job.status === JobStatus.PENDING) {
    progress = 0;
  } else if (job.status === JobStatus.PROCESSING) {
    // 시간 기반 진행률 추정 (30초 기본 + 파일크기 기반)
    const elapsedTime = Date.now() - (job.startedAt || job.createdAt);
    const estimatedTotalTime = Math.ceil(job.fileSize / (10 * 1024)) * 1000 + 30000; // ms
    progress = Math.min(0.9, elapsedTime / estimatedTotalTime); // 최대 90%까지만
  } else if (job.status === JobStatus.COMPLETED) {
    progress = 1.0;
  } else if (job.status === JobStatus.FAILED) {
    progress = 0;
  }
  
  console.log(`📊 작업 상태 조회 [${jobId}]: ${job.status} (${(progress * 100).toFixed(1)}%)`);
  
  res.json({
    jobId: jobId,
    status: job.status,
    progress: progress,
    transcript: job.transcript,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    originalFilename: job.originalFilename,
    fileSize: job.fileSize
  });
});

// ✅ 모든 작업 상태 조회 (디버깅용)
router.get('/transcribe/jobs', (req, res) => {
  const jobs = Array.from(transcriptionJobs.values()).map(job => ({
    id: job.id,
    status: job.status,
    originalFilename: job.originalFilename,
    fileSize: job.fileSize,
    createdAt: new Date(job.createdAt).toISOString(),
    startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
    completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null
  }));
  
  res.json({
    totalJobs: jobs.length,
    jobs: jobs
  });
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
    activeJobs: transcriptionJobs.size,
    recommendation: whisperInstalled ? 
      '로컬 Whisper가 설치되어 실제 음성 변환이 가능합니다.' : 
      'pip3 install openai-whisper 명령어로 Whisper를 설치해주세요.'
  });
});

module.exports = router;