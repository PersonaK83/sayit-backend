const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const transcriptionQueue = require('./transcription-queue');
const resultCollector = require('./result-collector');
const { generateJobId, formatFileSize, formatDuration } = require('./utils');

// 오디오 파일 분할
async function splitAudioFile(audioFilePath, chunkDuration = 120) { // 2분 청크
  const jobId = generateJobId();
  const outputDir = path.join(__dirname, '../temp', jobId);
  
  console.log(`🔪 오디오 파일 분할 시작 [${jobId}]`);
  console.log(`📁 입력 파일: ${audioFilePath}`);
  console.log(`📂 출력 디렉토리: ${outputDir}`);
  
  // 임시 디렉토리 생성
  await fs.mkdir(outputDir, { recursive: true });
  
  return new Promise((resolve, reject) => {
    ffmpeg(audioFilePath)
      .inputOptions('-f mp3') // 또는 입력 형식에 맞게
      .outputOptions([
        '-f segment',
        `-segment_time ${chunkDuration}`,
        '-segment_format mp3',
        '-reset_timestamps 1',
        '-c copy' // 재인코딩 없이 복사 (속도 향상)
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
          
          // 생성된 청크 파일 목록 가져오기
          const files = await fs.readdir(outputDir);
          const chunkFiles = files
            .filter(f => f.startsWith('chunk_'))
            .sort()
            .map(f => path.join(outputDir, f));
          
          console.log(`📋 생성된 청크: ${chunkFiles.length}개`);
          chunkFiles.forEach((file, index) => {
            console.log(`   ${index + 1}. ${path.basename(file)}`);
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

// 큐에 청크 작업 등록
async function queueAudioTranscription(audioFilePath, language = 'auto') {
  try {
    console.log('🚀 큐 기반 음성 변환 시작');
    console.log(`📁 파일: ${audioFilePath}`);
    console.log(`🌐 언어: ${language}`);
    
    // 1. 파일 분할
    const { jobId, chunkFiles, outputDir } = await splitAudioFile(audioFilePath);
    
    // 2. 결과 수집기에 작업 등록
    resultCollector.registerJob(jobId, chunkFiles.length);
    
    // 3. 각 청크를 큐에 등록
    const chunkJobs = [];
    for (let index = 0; index < chunkFiles.length; index++) {
      const chunkPath = chunkFiles[index];
      
      const job = await transcriptionQueue.add('chunk', {
        chunkPath,
        jobId,
        chunkIndex: index,
        totalChunks: chunkFiles.length,
        language,
        outputDir
      }, {
        priority: 10 - index, // 첫 번째 청크가 높은 우선순위
        delay: index * 500,    // 0.5초씩 지연하여 부하 분산
      });
      
      chunkJobs.push(job);
      console.log(`📋 청크 ${index + 1}/${chunkFiles.length} 큐 등록: ${job.id}`);
    }
    
    console.log(`🎯 큐 등록 완료 [${jobId}]: ${chunkFiles.length}개 청크`);
    
    return {
      jobId,
      totalChunks: chunkFiles.length,
      queuedJobs: chunkJobs,
      outputDir
    };
    
  } catch (error) {
    console.error('❌ 큐 등록 실패:', error);
    throw error;
  }
}

// 임시 파일 정리 함수
async function cleanupTempFiles(outputDir) {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`🧹 임시 파일 정리 완료: ${outputDir}`);
  } catch (error) {
    console.warn(`⚠️ 임시 파일 정리 실패: ${outputDir}`, error.message);
  }
}

module.exports = {
  queueAudioTranscription,
  splitAudioFile,
  cleanupTempFiles
};