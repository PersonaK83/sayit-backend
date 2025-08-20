const EventEmitter = require('events');

class TranscriptionCollector extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map(); // jobId -> { chunks: [], totalChunks: 0, results: [] }
  }
  
  // 작업 등록
  registerJob(jobId, totalChunks) {
    this.jobs.set(jobId, {
      chunks: new Array(totalChunks).fill(null),
      totalChunks,
      results: [],
      completedChunks: 0
    });
  }
  
  // 청크 결과 수집
  collectChunkResult(jobId, chunkIndex, result) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    
    job.chunks[chunkIndex] = result;
    job.completedChunks++;
    
    // 진행 상황 이벤트 발생
    this.emit('progress', {
      jobId,
      progress: (job.completedChunks / job.totalChunks) * 100,
      completedChunks: job.completedChunks,
      totalChunks: job.totalChunks
    });
    
    // 모든 청크 완료 시
    if (job.completedChunks === job.totalChunks) {
      const finalResult = job.chunks.join(' ');
      this.emit('completed', { jobId, result: finalResult });
      this.jobs.delete(jobId); // 메모리 정리
    }
  }
  
  // 작업 실패 처리
  handleJobFailure(jobId, error) {
    this.emit('failed', { jobId, error });
    this.jobs.delete(jobId);
  }
}

module.exports = new TranscriptionCollector();