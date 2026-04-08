import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { logSecurityEvent } from '../utils/security.logger.js';
import { errorResponse, badRequestResponse } from '../utils/response.js';

// Simple path resolution for compatibility
const __dirname = path.resolve();

// Allowed file types for registration documents
const REGISTRATION_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

// Maximum file sizes (in bytes)
const MAX_FILE_SIZES = {
  'application/pdf': 10 * 1024 * 1024,  // 10MB for PDF
  'image/jpeg': 5 * 1024 * 1024,       // 5MB for images
  'image/png': 5 * 1024 * 1024,        // 5MB for images
  'image/webp': 5 * 1024 * 1024        // 5MB for images
};

// Document types for registration
const DOCUMENT_TYPES = {
  'don_dang_ky_co_dau_truong': 'Đơn đăng ký có dấu trường',
  'cccd_mat_truoc': 'CCCD mặt trước',
  'cccd_mat_sau': 'CCCD mặt sau',
  'the_sinh_vien': 'Thẻ sinh viên',
  'giay_bao_nhap_hoc': 'Giấy báo nhập học',
  'giay_to_uu_tien': 'Giấy tờ ưu tiên',
  'don_xin_noi_tru': 'Đơn xin nội trú',
  'anh_3x4': 'Ảnh 3x4'
};

// Generate secure filename
const generateSecureFilename = (originalname, documentType) => {
  const ext = path.extname(originalname).toLowerCase();
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString('hex');
  return `${documentType}_${timestamp}_${randomBytes}${ext}`;
};

// Validate document type
const validateDocumentType = (fieldname) => {
  const documentType = fieldname.replace('document_', '');
  return DOCUMENT_TYPES[documentType] || null;
};

// File filter for registration documents
const registrationFileFilter = (req, file, cb) => {
  try {
    // Extract document type from fieldname
    const documentType = validateDocumentType(file.fieldname);
    
    if (!documentType) {
      const error = new Error(`Invalid document type: ${file.fieldname}`);
      error.code = 'INVALID_DOCUMENT_TYPE';
      return cb(error, false);
    }

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = REGISTRATION_FILE_TYPES[file.mimetype] || [];
    
    if (!allowedExts.includes(ext)) {
      const error = new Error(`File extension ${ext} not allowed for ${documentType}`);
      error.code = 'INVALID_FILE_EXTENSION';
      return cb(error, false);
    }

    // Check MIME type
    if (!REGISTRATION_FILE_TYPES[file.mimetype]) {
      const error = new Error(`MIME type ${file.mimetype} not allowed`);
      error.code = 'INVALID_MIME_TYPE';
      return cb(error, false);
    }

    // Add document type to file object for later processing
    file.documentType = documentType;
    
    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, 'uploads', 'registrations');
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    try {
      const secureFilename = generateSecureFilename(file.originalname, file.documentType);
      cb(null, secureFilename);
    } catch (error) {
      cb(error);
    }
  }
});

// Memory storage for validation
const memoryStorage = multer.memoryStorage();

// Create multer instance for registration documents
const uploadMultipleDocuments = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 10, // Maximum 10 files
    fields: 20, // Maximum 20 fields
    fieldNameSize: 100,
    fieldSize: 1024 * 1024
  },
  fileFilter: registrationFileFilter
});

// Memory upload for validation
const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
    fields: 20,
    fieldNameSize: 100,
    fieldSize: 1024 * 1024
  },
  fileFilter: registrationFileFilter
});

// Validate uploaded documents
const validateRegistrationDocuments = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return badRequestResponse(res, "Vui lòng chọn ít nhất một tài liệu");
    }

    const processedFiles = [];
    const errors = [];

    // Process each file
    for (const file of req.files) {
      try {
        // Validate file size
        const maxSize = MAX_FILE_SIZES[file.mimetype];
        if (file.size > maxSize) {
          errors.push(`${file.documentType}: File quá lớn (tối đa ${maxSize / (1024 * 1024)}MB)`);
          continue;
        }

        // Validate file content (basic check)
        if (file.mimetype === 'application/pdf') {
          // Basic PDF validation - check for PDF header
          const buffer = await fs.readFile(file.path);
          if (!buffer.toString('ascii', 0, 4).startsWith('%PDF')) {
            errors.push(`${file.documentType}: File PDF không hợp lệ`);
            await fs.unlink(file.path).catch(() => {});
            continue;
          }
        }

        processedFiles.push({
          fieldname: file.fieldname,
          originalname: file.originalname,
          filename: file.filename,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype,
          documentType: file.documentType,
          uploadedAt: new Date()
        });

      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        errors.push(`${file.documentType}: Lỗi xử lý file`);
        
        // Clean up file on error
        if (file.path) {
          await fs.unlink(file.path).catch(() => {});
        }
      }
    }

    if (processedFiles.length === 0) {
      return badRequestResponse(res, `Không có file nào được upload thành công: ${errors.join(', ')}`);
    }

    // Replace req.files with processed files
    req.files = processedFiles;

    // Log successful upload
    await logSecurityEvent('REGISTRATION_DOCUMENTS_UPLOADED', {
      userId: req.user?.id,
      fileCount: processedFiles.length,
      documentTypes: processedFiles.map(f => f.documentType),
      totalSize: processedFiles.reduce((sum, f) => sum + f.size, 0),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    next();
  } catch (error) {
    console.error('Document validation error:', error);
    
    // Clean up all uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        if (file.path) {
          await fs.unlink(file.path).catch(() => {});
        }
      }
    }

    await logSecurityEvent('DOCUMENT_VALIDATION_ERROR', {
      userId: req.user?.id,
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    errorResponse(res, "Lỗi validate tài liệu", error.message);
  }
};

// Error handler for upload errors
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let message = 'Lỗi upload file';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File quá lớn (tối đa 10MB)';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Quá nhiều file (tối đa 10 file)';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Field không mong muốn';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Quá nhiều phần';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Tên field quá dài';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Giá trị field quá dài';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Quá nhiều field';
        break;
    }
    
    return badRequestResponse(res, message);
  }
  
  if (error.code === 'INVALID_DOCUMENT_TYPE') {
    return badRequestResponse(res, `Loại tài liệu không hợp lệ: ${error.message}`);
  }
  
  if (error.code === 'INVALID_FILE_EXTENSION') {
    return badRequestResponse(res, `Định dạng file không được phép: ${error.message}`);
  }
  
  if (error.code === 'INVALID_MIME_TYPE') {
    return badRequestResponse(res, `Loại file không được phép: ${error.message}`);
  }
  
  next(error);
};

// Check required documents for registration
const checkRequiredDocuments = (documents, isPriority = false) => {
  const docTypes = new Set(documents?.map(doc => doc.documentType) || []);
  const missing = [];
  
  // Required documents for everyone
  const requiredDocs = ['don_dang_ky_co_dau_truong', 'cccd_mat_truoc', 'cccd_mat_sau'];
  
  // Check ID documents (one of these is required)
  const hasStudentCard = docTypes.has('the_sinh_vien');
  const hasAdmissionLetter = docTypes.has('giay_bao_nhap_hoc');
  
  if (!hasStudentCard && !hasAdmissionLetter) {
    missing.push('Cần có Thẻ sinh viên hoặc Giấy báo nhập học');
  }
  
  // Check required documents
  requiredDocs.forEach(docType => {
    if (!docTypes.has(docType)) {
      const displayName = DOCUMENT_TYPES[docType] || docType;
      missing.push(`Thiếu: ${displayName}`);
    }
  });
  
  // Check priority documents
  if (isPriority && !docTypes.has('giay_to_uu_tien')) {
    missing.push('Đối tượng ưu tiên cần có Giấy tờ ưu tiên');
  }
  
  return {
    hasAllRequired: missing.length === 0,
    missing
  };
};

export {
  uploadMultipleDocuments,
  memoryUpload,
  validateRegistrationDocuments,
  handleUploadError,
  checkRequiredDocuments,
  DOCUMENT_TYPES,
  REGISTRATION_FILE_TYPES,
  MAX_FILE_SIZES
};
