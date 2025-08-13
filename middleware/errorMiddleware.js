// 404 에러 처리
const notFound = (req, res, next) => {
  const error = new Error(`요청한 경로를 찾을 수 없습니다 - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// 전역 에러 처리
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Mongoose 관련 에러 (나중에 MongoDB 사용 시)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = '리소스를 찾을 수 없습니다';
  }

  // Multer 에러 처리
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = '파일 크기가 너무 큽니다. 25MB 이하의 파일을 업로드해주세요.';
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = '예상치 못한 파일 필드입니다. audio 필드를 사용해주세요.';
  }

  console.error('에러 발생:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(statusCode).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = { notFound, errorHandler }; 