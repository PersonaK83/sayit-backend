const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const transcriptionQueue = require('./transcription-queue');
// ❌ result-collector import 완전 제거
const { generateJobId, formatFileSize, formatDuration } = require('./utils');

// 파일 길이에 따른 동적 청크 크기
function calculateOptimalChunkDuration(estimatedDurationSeconds) {
  if (estimatedDurationSeconds <= 180) {        // 3분 이하
    return 45;  // 45초 청크
  } else if (estimatedDurationSeconds <= 600) { // 10분 이하
    return 60;  // 1분 청크
  } else {                                      // 10분 초과
    return 90;  // 1.5분 청크
  }
}

async function splitAudioFile(audioFilePath, jobId, customChunkDuration = null) {
  let chunkDuration = 60; // 기본값
  
  if (customChunkDuration) {
    chunkDuration = customChunkDuration;
  } else {
    // 파일 크기로 최적 청크 크기 계산
    const stats = await fs.stat(audioFilePath);
    const fileSizeKB = stats.size / 1024;
    const estimatedDuration = fileSizeKB / 2.1;
    chunkDuration = calculateOptimalChunkDuration(estimatedDuration);
  }
  
  console.log(`🔪 청크 크기: ${chunkDuration}초 (파일 크기: ${fileSizeKB.toFixed(1)}KB)`);
  
  const outputDir = path.join(__dirname, '../temp', jobId);
  
  console.log(`🔪 오디오 파일 분할 시작 [${jobId}]`);
  console.log(`📁 입력 파일: ${audioFilePath}`);
  console.log(`📂 출력 디렉토리: ${outputDir}`);
  
  // 임시 디렉토리 생성
  await fs.mkdir(outputDir, { recursive: true });
  
  return new Promise((resolve, reject) => {
    ffmpeg(audioFilePath)
      .outputOptions([
        '-f segment',
        `-segment_time ${chunkDuration}`,
        '-segment_format mp3',
        '-reset_timestamps 1',
        '-acodec libmp3lame',
        '-ab 128k'
      ])
      .output(path.join(outputDir, 'chunk_%03d.mp3'))
      .on('start', (commandLine) => {
        console.log(`🎬 FFmpeg 시작: ${commandLine}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`📊 분할 진행률: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', async () => {
        try {
          console.log(`✅ 파일 분할 완료 [${jobId}]`);
          
          const files = await fs.readdir(outputDir);
          const chunkFiles = files
            .filter(f => f.startsWith('chunk_'))
            .sort()
            .map(f => path.join(outputDir, f));
          
          console.log(`📋 생성된 청크: ${chunkFiles.length}개`);
          chunkFiles.forEach((file, index) => {
            console.log(`   청크 ${index + 1}: ${path.basename(file)}`);
          });
          
          resolve({ jobId, chunkFiles, outputDir });
        } catch (error) {
          console.error(`❌ 청크 파일 목록 읽기 실패 [${jobId}]:`, error);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error(`❌ FFmpeg 분할 실패 [${jobId}]:`, error);
        reject(error);
      })
      .run();
  });
}

// 큐에 청크 작업 등록 (JobId를 외부에서 받음)
async function queueAudioTranscription(audioFilePath, jobId, language = 'auto') {
  try {
    console.log('🚀 큐 기반 음성 변환 시작');
    console.log(`📁 파일: ${audioFilePath}`);
    console.log(`🎯 JobId: ${jobId}`);
    console.log(`🌐 언어: ${language}`);
    
    // 1. 파일 분할 (JobId 전달)
    const { chunkFiles, outputDir } = await splitAudioFile(audioFilePath, jobId);
    
    // 2. 각 청크를 큐에 등록
    const chunkJobs = [];
    for (let index = 0; index < chunkFiles.length; index++) {
      const chunkPath = chunkFiles[index];
      
      const job = await transcriptionQueue.add('chunk', {
        chunkPath,
        jobId, // 동일한 JobId 사용
        chunkIndex: index,
        totalChunks: chunkFiles.length,
        language,
        outputDir
      }, {
        priority: 10 - index,
        delay: index * 500,
      });
      
      chunkJobs.push(job);
      console.log(`📋 청크 ${index + 1}/${chunkFiles.length} 큐 등록: ${job.id}`);
    }
    
    console.log(`🎯 큐 등록 완료 [${jobId}]: ${chunkFiles.length}개 청크`);
    return { jobId, chunkCount: chunkFiles.length, chunkJobs };
    
  } catch (error) {
    console.error('❌ 큐 등록 실패:', error);
    throw error;
  }
}

// 임시 파일 정리
async function cleanupTempFiles(outputDir) {
  try {
    console.log(`🧹 임시 파일 정리: ${outputDir}`);
    await fs.rmdir(outputDir, { recursive: true });
    console.log('✅ 임시 파일 정리 완료');
  } catch (error) {
    console.error('❌ 임시 파일 정리 실패:', error);
  }
}

module.exports = {
  splitAudioFile,
  queueAudioTranscription,
  cleanupTempFiles
};