const fs = require('fs-extra');
const path = require('path');

/**
 * 임시 파일들을 정리하는 유틸리티 함수
 * @param {string} outputDir - 정리할 디렉토리 경로
 */
async function cleanupTempFiles(outputDir) {
  try {
    if (outputDir && await fs.pathExists(outputDir)) {
      await fs.remove(outputDir);
      console.log(`🧹 임시 파일 정리 완료: ${outputDir}`);
    }
  } catch (error) {
    console.error(`❌ 임시 파일 정리 실패: ${error.message}`);
  }
}

module.exports = cleanupTempFiles;