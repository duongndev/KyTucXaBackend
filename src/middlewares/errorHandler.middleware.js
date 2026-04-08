import { 
  errorResponse, 
  internalServerErrorResponse,
  standardResponse
} from "../utils/response.js";
import AuditLog from '../models/auditLog.model.js';
import { logSecurityEvent } from '../utils/security.logger.js';
import logger from '../utils/logger.util.js';



// Error types and their corresponding status codes
const ERROR_TYPES = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND_ERROR: 404,
  CONFLICT_ERROR: 409,
  RATE_LIMIT_ERROR: 429,
  INTERNAL_SERVER_ERROR: 500,
  DATABASE_ERROR: 500,
  EXTERNAL_SERVICE_ERROR: 502
};

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, errorType = 'INTERNAL_SERVER_ERROR', isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Log error using logger utility
const logError = async (error, req = null) => {
  const errorMeta = {
    statusCode: error.statusCode || 500,
    errorType: error.errorType || 'UNKNOWN',
    url: req?.originalUrl,
    method: req?.method,
    ip: req?.ip,
    userAgent: req?.get('User-Agent'),
    userId: req?.user?._id,
    userEmail: req?.user?.email,
    body: req?.body ? Object.keys(req.body) : null, // Only log field names for security
    query: req?.query || null,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  };
  
  // Use logger.util.js for error logging
  await logger.error(error.message, errorMeta);
};


// Handle different types of errors
const handleCastErrorDB = (err) => {
  const message = `Invalid ID: ${err.value}`;
  return new AppError(message, 400, 'VALIDATION_ERROR');
};

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field} '${value}' already exists. Please use a different value!`;
  return new AppError(message, 409, 'CONFLICT_ERROR');
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid data: ${errors.join('. ')}`;
  return new AppError(message, 400, 'VALIDATION_ERROR');
};

const handleJWTError = () =>
  new AppError('Token is invalid. Please login again!', 401, 'AUTHENTICATION_ERROR');

const handleJWTExpiredError = () =>
  new AppError('Token is expired. Please login again!', 401, 'AUTHENTICATION_ERROR');

// Send error response in development
const sendErrorDev = (err, req, res) => {
  return res.status(err.statusCode).json({
    success: false,
    message: err.message,
    error: err,
    stack: err.stack,
    errorType: err.errorType,
    timestamp: err.timestamp
  });
};

// Send error response in production
const sendErrorProd = (err, req, res) => {
  // Generic error messages to prevent information leakage
  const genericMessages = {
    400: 'Invalid request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not found',
    409: 'Conflict',
    422: 'Unprocessable entity',
    429: 'Too many requests',
    500: 'Internal server error'
  };

  if (err.isOperational) {
    // For operational errors, use generic messages based on status code
    const message = genericMessages[err.statusCode] || 'An error occurred';
    return standardResponse(res, err.statusCode, false, message, null);
  }
  
  // Programming or other unknown error: don't leak error details
  logger.error('Unexpected error occurred', { 
    message: err.message, 
    stack: err.stack 
  });
  return standardResponse(res, 500, false, 'An error occurred! Please try again later.', null);
};

// Global error handling middleware
const globalErrorHandler = async (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Determine error severity
  const severity = err.statusCode >= 500 ? 'CRITICAL' : 
                   err.statusCode >= 400 ? 'MEDIUM' : 'LOW';

  // Log to audit system
  try {
    await AuditLog.createLog({
      userId: req.user?.id || null,
      action: 'SUSPICIOUS_ACTIVITY',
      details: {
        endpoint: req.originalUrl,
        method: req.method,
        errorType: err.name || 'Unknown',
        errorMessage: err.message,
        statusCode: err.statusCode,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        body: req.body ? Object.keys(req.body) : undefined // Only log field names
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || 'Unknown',
      severity,
      status: 'FAILED',
      apiEndpoint: req.originalUrl,
      httpMethod: req.method,
      errorMessage: err.message
    });

    // Log security events for critical errors
    if (severity === 'CRITICAL') {
      await logSecurityEvent('CRITICAL_ERROR', {
        error: err.message,
        statusCode: err.statusCode,
        endpoint: req.originalUrl
      });
    }
  } catch (logError) {
    console.error('Audit logging failed:', logError);
  }

  // Log the error to file
  logError(err, req);
  
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;
    
    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    
    sendErrorProd(error, req, res);
  }
};

// Async error handler wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Validation error handler for express-validator
const createValidationError = (errors) => {
  const errorMessages = errors.array().map(error => ({
    field: error.path || error.param,
    message: error.msg,
    value: error.value
  }));
  
  return new AppError(
    'Invalid data',
    400,
    'VALIDATION_ERROR'
  );
};

// Database connection error handler
const handleDatabaseError = (error) => {
  console.error('Database connection error:', error);
  return new AppError(
    'Database connection failed',
    500,
    'DATABASE_ERROR'
  );
};

// Rate limit error handler
const handleRateLimitError = async (req, res, next) => {
  try {
    // Log rate limit violations for security monitoring
    await AuditLog.createLog({
      userId: req.user?.id || null,
      action: 'SUSPICIOUS_ACTIVITY',
      details: {
        endpoint: req.originalUrl,
        method: req.method,
        rateLimitType: req.rateLimit?.type || 'unknown',
        remainingPoints: req.rateLimit?.remaining || 0,
        totalHits: req.rateLimit?.totalHits || 0
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || 'Unknown',
      severity: 'MEDIUM',
      status: 'BLOCKED',
      apiEndpoint: req.originalUrl,
      httpMethod: req.method,
      errorMessage: 'Rate limit exceeded'
    });

    // Log security event for potential abuse
    await logSecurityEvent('RATE_LIMIT_VIOLATION', {
      endpoint: req.originalUrl,
      method: req.method,
      attempts: req.rateLimit?.totalHits || 0
    });
  } catch (logError) {
    console.error('Audit logging failed for rate limit:', logError);
  }

  const error = new AppError(
    'Too many requests from this IP, please try again later',
    429,
    'RATE_LIMIT_ERROR'
  );
  next(error);
};

// 404 error handler
const handleNotFound = async (req, res, next) => {
  try {
    // Log 404 attempts for security monitoring
    await AuditLog.createLog({
      userId: req.user?.id || null,
      action: 'SUSPICIOUS_ACTIVITY',
      details: {
        endpoint: req.originalUrl,
        method: req.method,
        query: req.query,
        headers: {
          'user-agent': req.get('User-Agent'),
          'referer': req.get('Referer')
        }
      },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || 'Unknown',
      severity: 'LOW',
      status: 'FAILED',
      apiEndpoint: req.originalUrl,
      httpMethod: req.method,
      errorMessage: `Route not found: ${req.originalUrl}`
    });
  } catch (logError) {
    console.error('Audit logging failed for 404:', logError);
  }

  const error = new AppError(
    `Route not found: ${req.originalUrl}`,
    404,
    'NOT_FOUND_ERROR'
  );
  next(error);
};

// Unhandled promise rejection handler
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection:', err.message);
  logError(err);
  
  // Close server & exit process
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  logError(err);
  
  // Close server & exit process
  process.exit(1);
});

export {
  AppError,
  globalErrorHandler,
  catchAsync,
  createValidationError,
  handleDatabaseError,
  handleRateLimitError,
  handleNotFound,
  logError,
  ERROR_TYPES
};
