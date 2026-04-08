import logger from '../utils/logger.util.js';

/**
 * Request logging middleware
 * Logs all HTTP requests with timing information
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  const requestInfo = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };
  
  // Only log in development or for specific endpoints
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Incoming request', requestInfo);
  }
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const responseInfo = {
      ...requestInfo,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    };
    
    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error('Request failed with server error', responseInfo);
    } else if (res.statusCode >= 400) {
      logger.warn('Request failed with client error', responseInfo);
    } else if (process.env.NODE_ENV === 'development') {
      logger.info('Request completed', responseInfo);
    }
    
    // Warn about slow requests
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        ...responseInfo,
        threshold: '5000ms'
      });
    }
  });
  
  next();
};

export { requestLogger };
