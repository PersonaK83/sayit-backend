const EventEmitter = require('events');
const cleanupTempFiles = require('./cleanup-utils');

class TranscriptionCollector extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map(); // jobId -> { chunks: [], totalChunks: 0, results: [] }
  }
  
  // 작업 등록
  registerJob(jobId, totalChunks) {
    console.log(`📝 작업 등록 [${jobId}]: ${totalChunks}개 청크`);
    
    this.jobs.set(jobId, {
      chunks: new Array(totalChunks).fill(null),
      totalChunks,
      results: [],
      completedChunks: 0,
      createdAt: Date.now(),
      outputDir: null
    });
    
    // 진행 상황 초기 이벤트
    this.emit('progress', {
      jobId,
      progress: 0,
      completedChunks: 0,
      totalChunks,
      status: 'started'
    });
  }
  
  // 청크 결과 수집
  collectChunkResult(jobId, chunkIndex, result) {
    const job = this.jobs.get(jobId);
    if (!job) {
      console.warn(`⚠️ 알 수 없는 작업 ID: ${jobId}`);
      return;
    }
    
    job.chunks[chunkIndex] = result;
    job.completedChunks++;
    
    const progress = (job.completedChunks / job.totalChunks) * 100;
    
    console.log(`📊 청크 수집 [${jobId}] ${job.completedChunks}/${job.totalChunks} (${progress.toFixed(1)}%)`);
    
    // 진행 상황 이벤트 발생
    this.emit('progress', {
      jobId,
      progress,
      completedChunks: job.completedChunks,
      totalChunks: job.totalChunks,
      status: 'processing'
    });
    
    // 모든 청크 완료 시
    if (job.completedChunks === job.totalChunks) {
      console.log(`🎉 모든 청크 완료 [${jobId}], 결과 병합 중...`);
      
      // null이 아닌 청크들만 결합
      const validChunks = job.chunks.filter(chunk => chunk !== null && chunk.trim() !== '');
      const finalResult = validChunks.join(' ').trim();
      
      console.log(`✅ 최종 결과 생성 [${jobId}]: ${finalResult.length}자`);
      console.log(`📝 결과 미리보기: ${finalResult.substring(0, 200)}...`);
      
      this.emit('completed', { 
        jobId, 
        result: finalResult,
        totalChunks: job.totalChunks,
        processingTime: Date.now() - job.createdAt
      });
      
      // 메모리 정리
      this.jobs.delete(jobId);
    }
  }
  
  // 작업 실패 처리
  handleJobFailure(jobId, error) {
    console.error(`💥 작업 실패 [${jobId}]:`, error);
    
    this.emit('failed', { 
      jobId, 
      error: error.message || error,
      timestamp: Date.now()
    });
    
    this.jobs.delete(jobId);
  }
  
  // 작업 상태 조회
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }
    
    return {
      jobId,
      progress: (job.completedChunks / job.totalChunks) * 100,
      completedChunks: job.completedChunks,
      totalChunks: job.totalChunks,
      status: job.completedChunks === job.totalChunks ? 'completed' : 'processing',
      createdAt: job.createdAt
    };
  }
  
  // 모든 활성 작업 조회
  getAllJobs() {
    const jobs = [];
    for (const [jobId, job] of this.jobs.entries()) {
      jobs.push(this.getJobStatus(jobId));
    }
    return jobs;
  }
}

module.exports = new TranscriptionCollector();