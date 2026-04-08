import mongoSanitize from 'express-mongo-sanitize';
import { logSecurityEvent } from '../utils/security.logger.js';

// NoSQL injection prevention middleware
const noSQLSanitizer = mongoSanitize({
  replaceWith: '_', // Replace prohibited characters with underscore
  onSanitize: ({ req, key }) => {
    // Log sanitization events
    logSecurityEvent('NOSQL_INJECTION_ATTEMPT', {
      sanitizedKey: key,
      originalValue: req.body?.[key] || req.query?.[key] || req.params?.[key],
      endpoint: req.originalUrl,
      method: req.method
    }, req);
  }
});

// Advanced NoSQL injection detection
const detectNoSQLInjection = async (req, res, next) => {
  const dangerousPatterns = [
    /\$where/i,
    // Removed standard operators to avoid false positives in text content
    // as keys are already sanitized by mongoSanitize
    /javascript:/i,
    /eval\s*\(/i,
    /function\s*\(/i
  ];

  const checkForNoSQLInjection = (value) => {
    if (typeof value !== 'string') return false;
    return dangerousPatterns.some(pattern => pattern.test(value));
  };

  const checkObject = (obj, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check key names for injection patterns
      if (checkForNoSQLInjection(key)) {
        return { detected: true, field: currentPath, value: key, type: 'key' };
      }
      
      // Check string values
      if (typeof value === 'string' && checkForNoSQLInjection(value)) {
        return { detected: true, field: currentPath, value, type: 'value' };
      } 
      
      // Recursively check nested objects
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const result = checkObject(value, currentPath);
        if (result.detected) return result;
      }
      
      // Check arrays
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'string' && checkForNoSQLInjection(value[i])) {
            return { detected: true, field: `${currentPath}[${i}]`, value: value[i], type: 'array_value' };
          }
          if (typeof value[i] === 'object' && value[i] !== null) {
            const result = checkObject(value[i], `${currentPath}[${i}]`);
            if (result.detected) return result;
          }
        }
      }
    }
    return { detected: false };
  };

  try {
    // Check body, query, and params
    const sources = [
      { data: req.body, name: 'body' },
      { data: req.query, name: 'query' },
      { data: req.params, name: 'params' }
    ];

    for (const source of sources) {
      if (source.data && typeof source.data === 'object') {
        const result = checkObject(source.data);
        if (result.detected) {
          await logSecurityEvent('NOSQL_INJECTION_DETECTED', {
            source: source.name,
            field: result.field,
            value: result.value,
            type: result.type,
            endpoint: req.originalUrl,
            method: req.method,
            severity: 'HIGH'
          }, req);

          return res.status(400).json({
            success: false,
            message: 'Invalid query parameters detected'
          });
        }
      }
    }

    next();
  } catch (error) {
    await logSecurityEvent('NOSQL_INJECTION_CHECK_ERROR', {
      error: error.message
    }, req);

    return res.status(500).json({
      success: false,
      message: 'Database security check failed'
    });
  }
};

// Query parameter validation for MongoDB operations
const validateMongoQueries = async (req, res, next) => {
  try {
    // Validate common query parameters
    if (req.query.sort) {
      const allowedSortFields = ['name', 'price', 'createdAt', 'updatedAt', 'rating', 'stock'];
      const sortFields = req.query.sort.split(',');
      
      for (const field of sortFields) {
        const cleanField = field.replace(/^-/, ''); // Remove descending indicator
        if (!allowedSortFields.includes(cleanField)) {
          await logSecurityEvent('INVALID_SORT_FIELD', {
            field: cleanField,
            allowedFields: allowedSortFields
          }, req);
          
          return res.status(400).json({
            success: false,
            message: 'Invalid sort field'
          });
        }
      }
    }

    // Validate pagination parameters
    if (req.query.page) {
      const page = parseInt(req.query.page);
      if (isNaN(page) || page < 1 || page > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Invalid page number'
        });
      }
    }

    if (req.query.limit) {
      const limit = parseInt(req.query.limit);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          message: 'Invalid limit value'
        });
      }
    }

    // Validate search parameters
    if (req.query.search) {
      if (req.query.search.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Search query too long'
        });
      }
    }

    next();
  } catch (error) {
    await logSecurityEvent('QUERY_VALIDATION_ERROR', {
      error: error.message
    }, req);

    return res.status(500).json({
      success: false,
      message: 'Query validation failed'
    });
  }
};

// Database connection security
const secureDBConnection = {
  // Secure connection options for MongoDB
  getSecureConnectionOptions: () => ({
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    bufferMaxEntries: 0, // Disable mongoose buffering
    bufferCommands: false, // Disable mongoose buffering
    maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    family: 4, // Use IPv4, skip trying IPv6
    retryWrites: true,
    retryReads: true,
    readPreference: 'primary', // Only read from primary
    ssl: process.env.NODE_ENV === 'production', // Use SSL in production
    sslValidate: process.env.NODE_ENV === 'production',
    authSource: 'admin' // Specify auth database
  }),

  // Monitor database connections
  setupConnectionMonitoring: (mongoose) => {
    mongoose.connection.on('connected', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('✅ Database connected securely');
      }
    });

    mongoose.connection.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('❌ Database connection error:', err);
        logSecurityEvent('DATABASE_CONNECTION_ERROR', {
          error: err.message
        });
      }
    });

    mongoose.connection.on('disconnected', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('⚠️ Database disconnected');
        logSecurityEvent('DATABASE_DISCONNECTED', {});
      }
    });

    // Only setup graceful shutdown for production
    if (process.env.NODE_ENV !== 'test') {
      process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('Database connection closed through app termination');
        process.exit(0);
      });
    }
  }
};

// Database query logging for audit
const logDatabaseQueries = async (req, res, next) => {
  // Only log sensitive operations
  const sensitiveOperations = ['POST', 'PUT', 'PATCH', 'DELETE'];
  const sensitiveEndpoints = ['/auth/', '/user/', '/admin/', '/payment/'];

  if (sensitiveOperations.includes(req.method) || 
      sensitiveEndpoints.some(endpoint => req.originalUrl.includes(endpoint))) {
    
    await logSecurityEvent('DATABASE_OPERATION', {
      method: req.method,
      endpoint: req.originalUrl,
      userId: req.user?.id,
      userRole: req.user?.role,
      queryParams: req.query,
      bodyKeys: req.body ? Object.keys(req.body) : []
    }, req);
  }

  next();
};

// Prevent database enumeration attacks
const preventEnumeration = async (req, res, next) => {
  // Add random delay to prevent timing attacks
  const delay = Math.floor(Math.random() * 100) + 50; // 50-150ms random delay
  
  setTimeout(() => {
    next();
  }, delay);
};

export {
  noSQLSanitizer,
  detectNoSQLInjection,
  validateMongoQueries,
  secureDBConnection,
  logDatabaseQueries,
  preventEnumeration
};