import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { logSecurityEvent } from '../utils/security.logger.js';
import { errorResponse } from '../utils/response.js';

// Store for tracking failed attempts
const failedAttempts = new Map();

// General API rate limiter
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Limit each IP to 2000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again .',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'general'
    });
    
    return errorResponse(res, 'Too many requests from this IP, please try again later.', 429);
  }
});

// Strict rate limiter for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Limit each IP to 2000 login attempts per windowMs
  message: {
    error: 'Too many authentication attempts from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    logSecurityEvent('AUTH_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'authentication'
    });
    
    return errorResponse(res, 'Too many authentication attempts from this IP, please try again later.', 429);
  }
});

// Password reset rate limiter
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Limit each IP to 1000 password reset attempts per hour
  message: {
    error: 'Too many password reset attempts from this IP, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('PASSWORD_RESET_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'password_reset'
    });
    
    return errorResponse(res, 'Too many password reset attempts from this IP, please try again later.', 429);
  }
});

// File upload rate limiter
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: {
    error: 'Too many file uploads from this IP, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('UPLOAD_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'file_upload'
    });
    
    return errorResponse(res, 'Too many file uploads from this IP, please try again later.', 429);
  }
});

// API key rate limiter (for authenticated users)
export const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Higher limit for authenticated users
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise fall back to IP with IPv6 support
    return req.user?.id || ipKeyGenerator(req);
  },
  message: {
    error: 'API rate limit exceeded for your account.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('API_KEY_RATE_LIMIT_EXCEEDED', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'api_key'
    });
    
    return errorResponse(res, 'API rate limit exceeded for your account.', 429);
  }
});

// Slow down middleware for progressive delays
export const progressiveSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per windowMs without delay
  // express-slow-down v2 changed the semantics of delayMs. To preserve the
  // previous behavior (add 500ms per extra request after delayAfter), provide
  // a function that receives (used, req) and returns the computed delay.
  delayMs: (used, req) => {
    const delayAfter = req?.slowDown?.limit ?? 50;
    const extra = Math.max(0, used - delayAfter);
    return Math.min(extra * 500, 20000); // cap at maxDelayMs
  },
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  // Note: onLimitReached is deprecated, logging moved to custom middleware
});

// Adaptive rate limiter based on failed attempts
export const adaptiveRateLimit = (req, res, next) => {
  const clientId = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  
  // Clean old entries
  for (const [key, data] of failedAttempts.entries()) {
    if (now - data.firstAttempt > windowMs) {
      failedAttempts.delete(key);
    }
  }
  
  const attempts = failedAttempts.get(clientId);
  
  if (attempts) {
    // Calculate dynamic limit based on failed attempts
    const baseLimit = 100;
    const reductionFactor = Math.min(attempts.count * 0.1, 0.8); // Max 80% reduction
    const dynamicLimit = Math.floor(baseLimit * (1 - reductionFactor));
    
    if (attempts.count >= dynamicLimit) {
      logSecurityEvent('ADAPTIVE_RATE_LIMIT_EXCEEDED', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        failedAttempts: attempts.count,
        dynamicLimit
      });
      
      return errorResponse(res, 'Too many failed attempts from this IP, please try again after 15 minutes.', 429);
    }
  }
  
  next();
};

// Track failed authentication attempts
export const trackFailedAttempts = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Check if this is a failed authentication attempt
    if (res.statusCode === 401 || res.statusCode === 403) {
      const clientId = req.ip;
      const now = Date.now();
      
      const attempts = failedAttempts.get(clientId) || {
        count: 0,
        firstAttempt: now
      };
      
      attempts.count++;
      attempts.lastAttempt = now;
      
      failedAttempts.set(clientId, attempts);
      
      logSecurityEvent('FAILED_AUTH_ATTEMPT_TRACKED', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        totalFailedAttempts: attempts.count
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

// DDoS protection middleware
export const ddosProtection = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Very strict limit for potential DDoS
  message: {
    error: 'DDoS attack detected. Temporary access blocked.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('DDOS_PROTECTION_TRIGGERED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      severity: 'HIGH'
    });
    
    return errorResponse(res, 'DDoS attack detected. Temporary access blocked.', 429);
  }
});

// Burst protection for specific endpoints
export const burstProtection = rateLimit({
  windowMs: 1000, // 1 second
  max: 10, // Max 10 requests per second 
  message: {
    error: 'Too many requests from this IP, please try again after 1 second.',
    retryAfter: '1 second'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('BURST_PROTECTION_TRIGGERED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl
    });
    
    return errorResponse(res, 'Too many requests from this IP, please try again after 1 second.', 429);
  }
});


// Search limiter - 30 requests per minute
export const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: {
    error: 'Too many search requests from this IP, please try again after 1 minute',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('SEARCH_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'search'
    });
    
    return errorResponse(res, 'Too many search requests from this IP, please try again after 1 minute', 429);
  }
});

// Review operations limiter - 5 requests per 10 minutes
export const reviewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: {
    error: 'Too many review operations from this IP, please try again after 10 minutes',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('REVIEW_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'review'
    });
    
    return errorResponse(res, 'Too many review operations from this IP, please try again after 10 minutes', 429);
  }
});

// Notification operations limiter - 20 requests per minute
export const notificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  message: {
    error: 'Too many notification operations from this IP, please try again after 1 minute',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent('NOTIFICATION_RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'notification'
    });
    
    return errorResponse(res, 'Too many notification operations from this IP, please try again after 1 minute', 429);
  }
});

// Admin operations limiter - 100 requests per minute
export const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: 'Too many admin operations from this IP, please try again after 1 minute',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Priority user ID if logged in, fallback to IP
    const id = req.user?._id;
    return `admin_${id || ipKeyGenerator(req)}`;
  },
  handler: (req, res) => {
    logSecurityEvent('ADMIN_RATE_LIMIT_EXCEEDED', {
      userId: req.user?._id,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      limit: 'admin'
    });
    
    return errorResponse(res, 'Too many admin operations from this IP, please try again after 1 minute', 429);
  }
});

// Clean up failed attempts periodically
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    for (const [key, data] of failedAttempts.entries()) {
      if (now - data.firstAttempt > windowMs) {
        failedAttempts.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}