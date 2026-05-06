import path from "path";
import multer from "multer";
import crypto from 'crypto';

// Simple path resolution for Jest compatibility
const __dirname = path.resolve();
import { logSecurityEvent } from "../utils/security.logger.js";
import { errorResponse, internalServerErrorResponse } from "../utils/response.js";

// Allowed MIME types and their corresponding extensions
const ALLOWED_FILE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4']
};

// Maximum file sizes by type (in bytes)
const MAX_FILE_SIZES = {
  'image/jpeg': 10 * 1024 * 1024, // 10MB
  'image/png': 10 * 1024 * 1024,  // 10MB
  'image/webp': 10 * 1024 * 1024, // 10MB
  'video/mp4': 100 * 1024 * 1024  // 100MB
};

// Dangerous file extensions to block
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl', '.sh', '.ps1'
];

// Generate secure filename
const generateSecureFilename = (originalname) => {
  const ext = path.extname(originalname).toLowerCase();
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  return `${timestamp}_${randomBytes}${ext}`;
};

// Validate file type using magic numbers
const validateFileType = async (buffer, mimetype, originalname) => {
  try {
    const fileType = await fromBuffer(buffer);
    
    // Check if file type detection failed
    if (!fileType) {
      return { valid: false, reason: 'Unable to detect file type' };
    }
    
    // Check if detected MIME type matches declared MIME type
    if (fileType.mime !== mimetype) {
      return { 
        valid: false, 
        reason: `MIME type mismatch: declared ${mimetype}, detected ${fileType.mime}` 
      };
    }
    
    // Check if MIME type is allowed
    if (!ALLOWED_FILE_TYPES[fileType.mime]) {
      return { 
        valid: false, 
        reason: `File type ${fileType.mime} not allowed` 
      };
    }
    
    // Check if extension matches MIME type
    const ext = path.extname(originalname).toLowerCase();
    if (!ALLOWED_FILE_TYPES[fileType.mime].includes(ext)) {
      return { 
        valid: false, 
        reason: `Extension ${ext} doesn't match MIME type ${fileType.mime}` 
      };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: `File validation error: ${error.message}` };
  }
};

// Check for dangerous file patterns
const checkDangerousPatterns = (filename, buffer) => {
  const ext = path.extname(filename).toLowerCase();
  
  // Check dangerous extensions
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return { safe: false, reason: `Dangerous file extension: ${ext}` };
  }
  
  // Check for double extensions (e.g., file.jpg.exe)
  const parts = filename.split('.');
  if (parts.length > 2) {
    for (let i = 1; i < parts.length - 1; i++) {
      if (DANGEROUS_EXTENSIONS.includes(`.${parts[i].toLowerCase()}`)) {
        return { safe: false, reason: 'Double extension detected' };
      }
    }
  }
  
  // Check for executable signatures in file content
  const executableSignatures = [
    Buffer.from([0x4D, 0x5A]), // PE executable
    Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF executable
    Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]), // Mach-O executable
  ];
  
  for (const signature of executableSignatures) {
    if (buffer.indexOf(signature) === 0) {
      return { safe: false, reason: 'Executable file signature detected' };
    }
  }
  
  return { safe: true };
};

// Enhanced file filter
const enhancedFileFilter = async (req, file, cb) => {
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Basic extension check
    const allowedExts = Object.values(ALLOWED_FILE_TYPES).flat();
    if (!allowedExts.includes(ext)) {
      const error = new Error(`File extension ${ext} not allowed`);
      error.code = 'INVALID_FILE_TYPE';
      return cb(error, false);
    }
    
    // Check file size limit based on type
    const maxSize = MAX_FILE_SIZES[file.mimetype];
    if (maxSize && req.headers['content-length'] > maxSize) {
      const error = new Error(`File too large. Maximum size for ${file.mimetype} is ${maxSize / (1024 * 1024)}MB`);
      error.code = 'FILE_TOO_LARGE';
      return cb(error, false);
    }
    
    // Log security event for file upload attempt
    await logSecurityEvent('FILE_UPLOAD_ATTEMPT', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: req.headers['content-length'] || 'unknown'
    }, req);
    
    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

// Custom storage with security checks
const secureStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadDir = 'src/uploads/';
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    try {
      const secureFilename = generateSecureFilename(file.originalname);
      cb(null, secureFilename);
    } catch (error) {
      cb(error);
    }
  }
});

// Memory storage for validation
const memoryStorage = multer.memoryStorage();

// Create multer instances
const secureUpload = multer({
  storage: secureStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
    files: 10, // Maximum 10 files
    fields: 10, // Maximum 10 fields
    fieldNameSize: 100, // Maximum field name size
    fieldSize: 1024 * 1024 // Maximum field value size (1MB)
  },
  fileFilter: enhancedFileFilter
});

const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 10,
    fields: 10,
    fieldNameSize: 100,
    fieldSize: 1024 * 1024
  },
  fileFilter: enhancedFileFilter
});

// Middleware for additional security validation
const validateUploadedFile = async (req, res, next) => {
  try {
    if (!req.file && !req.files) {
      return next();
    }
    
    const files = req.files || [req.file];
    
    for (const file of files) {
      if (!file) continue;
      
      let buffer;
      if (file.buffer) {
        buffer = file.buffer;
      } else {
        // Read file from disk for validation
        buffer = await fs.readFile(file.path);
      }
      
      // Validate file type using magic numbers
      const typeValidation = await validateFileType(buffer, file.mimetype, file.originalname);
      if (!typeValidation.valid) {
        // Delete uploaded file if validation fails
        if (file.path) {
          await fs.unlink(file.path).catch(() => {});
        }
        
        await logSecurityEvent('FILE_UPLOAD_REJECTED', {
          filename: file.originalname,
          reason: typeValidation.reason,
          mimetype: file.mimetype
        }, req);
        
        return errorResponse(res, `File validation failed: ${typeValidation.reason}`, 400);
      }
      
      // Check for dangerous patterns
      const safetyCheck = checkDangerousPatterns(file.originalname, buffer);
      if (!safetyCheck.safe) {
        // Delete uploaded file if safety check fails
        if (file.path) {
          await fs.unlink(file.path).catch(() => {});
        }
        
        await logSecurityEvent('MALICIOUS_FILE_DETECTED', {
          filename: file.originalname,
          reason: safetyCheck.reason,
          mimetype: file.mimetype
        }, req);
        
        return errorResponse(res, `Security check failed: ${safetyCheck.reason}`, 400);
      }
    }
    
    // Log successful upload
    await logSecurityEvent('FILE_UPLOAD_SUCCESS', {
      fileCount: files.length,
      files: files.map(f => ({
        filename: f.filename || f.originalname,
        mimetype: f.mimetype,
        size: f.size
      }))
    }, req);
    
    next();
  } catch (error) {
    // Clean up any uploaded files on error
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    if (req.files) {
      for (const file of req.files) {
        if (file?.path) {
          await fs.unlink(file.path).catch(() => {});
        }
      }
    }
    
    await logSecurityEvent('FILE_UPLOAD_ERROR', {
      error: error.message
    }, req);
    
    return internalServerErrorResponse(res, 'File upload validation error');
  }
};

// Error handler for multer errors
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields';
        break;
    }
    
    logSecurityEvent('FILE_UPLOAD_ERROR', {
      error: error.code,
      message: error.message
    }, req);
    
    return errorResponse(res, message, 400);
  }
  
  if (error.code === 'INVALID_FILE_TYPE' || error.code === 'FILE_TOO_LARGE') {
    return errorResponse(res, error.message, 400);
  }
  
  next(error);
};

export {
  secureUpload,
  memoryUpload,
  validateUploadedFile,
  handleUploadError,
  generateSecureFilename,
  validateFileType,
  checkDangerousPatterns
};