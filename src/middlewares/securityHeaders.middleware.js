import helmet from 'helmet';
import cors from 'cors';
import { logSecurityEvent } from '../utils/security.logger.js';

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:5173',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-CSRF-Token'
  ],
  exposedHeaders: ['set-cookie'],
  maxAge: 86400 // 24 hours
};

// Helmet configuration for security headers
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
};

// Custom security headers middleware
const customSecurityHeaders = (req, res, next) => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Prevent caching of sensitive endpoints
  if (req.path.includes('/api/auth') || req.path.includes('/api/admin')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  
  next();
};

// Rate limiting headers
const rateLimitHeaders = (req, res, next) => {
  // Add rate limit information to response headers before sending
  if (req.rateLimit && !res.headersSent) {
    res.setHeader('X-RateLimit-Limit', req.rateLimit.limit);
    res.setHeader('X-RateLimit-Remaining', req.rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', req.rateLimit.reset);
  }
  
  next();
};

// Security middleware stack
const securityMiddleware = [
  helmet(helmetOptions),
  cors(corsOptions),
  customSecurityHeaders,
  rateLimitHeaders
];

export {
  corsOptions,
  helmetOptions,
  customSecurityHeaders,
  rateLimitHeaders,
  securityMiddleware
};

const cookieSecurityMiddleware = (req, res, next) => {
  const originalCookie = res.cookie;
  res.cookie = function(name, value, options = {}) {
    const secureOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      ...options
    };
    if (name.includes('token') || name.includes('session') || name.includes('auth')) {
      logSecurityEvent('SECURITY_COOKIE_SET', {
        cookieName: name,
        secure: secureOptions.secure,
        httpOnly: secureOptions.httpOnly,
        sameSite: secureOptions.sameSite
      }, req);
    }
    return originalCookie.call(this, name, value, secureOptions);
  };
  next();
};

const clearInsecureCookies = (req, res, next) => {
  if (req.cookies && typeof req.cookies === 'object') {
    const cookiesToCheck = ['connect.sid', 'sessionId', 'token', 'auth'];
    cookiesToCheck.forEach(cookieName => {
      if (req.cookies[cookieName]) {
        res.clearCookie(cookieName);
      }
    });
  }
  next();
};

export {
  cookieSecurityMiddleware,
  clearInsecureCookies
};
