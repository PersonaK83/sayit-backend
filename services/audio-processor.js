const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const transcriptionQueue = require('./transcription-queue');

// 오디오 파일 분할
async function splitAudioFile(audioFilePath, chunkDuration = 120) { // 2분 청크
  const jobId = generateJobId();
  const outputDir = path.join(__dirname, '../temp', jobId);
  
  // 임시 디렉토리 생성
  await fs.mkdir(outputDir, { recursive: true });
  
  return new Promise((resolve, reject) => {
    ffmpeg(audioFilePath)
      .inputOptions('-f mp3') // 또는 입력 형식에 맞게
      .outputOptions([
        '-f segment',
        `-segment_time ${chunkDuration}`,
        '-segment_format mp3',
        '-reset_timestamps 1'
      ])
      .output(path.join(outputDir, 'chunk_%03d.mp3'))
      .on('end', async () => {
        try {
          // 생성된 청크 파일 목록 가져오기
          const files = await fs.readdir(outputDir);
          const chunkFiles = files
            .filter(f => f.startsWith('chunk_'))
            .sort()
            .map(f => path.join(outputDir, f));
          
          resolve({ jobId, chunkFiles, outputDir });
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject)
      .run();
  });
}

// 큐에 청크 작업 등록
async function queueAudioTranscription(audioFilePath, language = 'auto') {
  try {
    // 1. 파일 분할
    console.log('🔪 오디오 파일 분할 시작...');
    const { jobId, chunkFiles, outputDir } = await splitAudioFile(audioFilePath);
    
    // 2. 각 청크를 큐에 등록
    const chunkJobs = chunkFiles.map((chunkPath, index) => {
      return transcriptionQueue.add('chunk', {
        chunkPath,
        jobId,
        chunkIndex: index,
        totalChunks: chunkFiles.length,
        language,
        outputDir
      }, {
        priority: 10 - index, // 첫 번째 청크가 높은 우선순위
        delay: index * 1000,   // 1초씩 지연하여 부하 분산
      });
    });
    
    console.log(`📋 큐에 ${chunkFiles.length}개 청크 등록 완료 [${jobId}]`);
    
    return {
      jobId,
      totalChunks: chunkFiles.length,
      queuedJobs: chunkJobs
    };
    
  } catch (error) {
    console.error('❌ 큐 등록 실패:', error);
    throw error;
  }
}

module.exports = {
  queueAudioTranscription,
  splitAudioFile
};