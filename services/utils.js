const { v4: uuidv4 } = require('uuid');

// Job ID 생성 함수
function generateJobId() {
  const timestamp = Date.now();
  const uuid = uuidv4().split('-')[0]; // UUID의 첫 번째 부분만 사용
  return `job_${timestamp}_${uuid}`;
}

// 파일 크기를 읽기 쉬운 형태로 변환
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 시간을 읽기 쉬운 형태로 변환
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}분 ${remainingSeconds}초`;
}

// 예상 처리 시간 계산 (파일 크기 기반)
function estimateProcessingTime(fileSizeBytes, durationSeconds) {
  // 기본: 1분 오디오당 20초 처리 시간
  const baseProcessingTime = (durationSeconds / 60) * 20;
  
  // 파일 크기 보정 (큰 파일일수록 조금 더 오래 걸림)
  const sizeMultiplier = Math.min(1.5, 1 + (fileSizeBytes / (10 * 1024 * 1024))); // 10MB 기준
  
  return Math.ceil(baseProcessingTime * sizeMultiplier);
}

module.exports = {
  generateJobId,
  formatFileSize,
  formatDuration,
  estimateProcessingTime
}; 