import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "../config/cloudinary.config.js";

// Simple path resolution for Jest compatibility
const __dirname = path.resolve();

// Configure Cloudinary
// cloudinary.v2.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET_KEY
// });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads', 'documents');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = [
    "image/jpeg",
    "image/jpg", 
    "image/png",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, PDF, and Word documents are allowed."), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10 // Maximum 10 files
  }
});

// Upload single file
export const uploadSingle = upload.single("document");

// Upload single stamped document
export const uploadStampedDocument = upload.single("stamped_document");

// Upload multiple files
export const uploadMultiple = upload.array("documents", 10);

// Upload file to Cloudinary
export const uploadToCloudinary = async (filePath, folder = "KTX/documents") => {
  try {
    const result = await cloudinary.v2.uploader.upload(filePath, {
      folder: folder,
      resource_type: "auto",
      use_filename: true,
      unique_filename: true
    });

    // Delete local file after upload
    fs.unlinkSync(filePath);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      size: result.bytes
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw new Error("Failed to upload file to cloud storage");
  }
};

// Upload multiple files to Cloudinary
export const uploadMultipleToCloudinary = async (files, folder = "KTX/documents") => {
  try {
    const uploadPromises = files.map(file => uploadToCloudinary(file.path, folder));
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    console.error("Multiple Cloudinary upload error:", error);
    throw new Error("Failed to upload files to cloud storage");
  }
};

// Delete file from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.v2.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    throw new Error("Failed to delete file from cloud storage");
  }
};

// Validate document type
export const validateDocumentType = (docType) => {
  const validTypes = [
    "application_form",
    "student_card", 
    "id_card",
    "admission_letter",
    "photo",
    "health_certificate",
    "commitment_form",
    "poverty_certificate",
    "disability_certificate",
    "ethnic_minority",
    "martyr_family",
    "other"
  ];

  return validTypes.includes(docType);
};

// Get file information
export const getFileInfo = (file) => {
  return {
    originalName: file.originalname,
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
    encoding: file.encoding
  };
};

// Clean up local files
export const cleanupLocalFiles = (files) => {
  if (Array.isArray(files)) {
    files.forEach(file => {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
  } else if (files && files.path && fs.existsSync(files.path)) {
    fs.unlinkSync(files.path);
  }
};

// Generate unique filename
export const generateUniqueFilename = (originalName, prefix = "") => {
  const timestamp = Date.now();
  const uuid = uuidv4().substring(0, 8);
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  
  return `${prefix}${name}_${timestamp}_${uuid}${ext}`;
};

// Check file size
export const checkFileSize = (file, maxSize = 5 * 1024 * 1024) => {
  return file.size <= maxSize;
};

// Get file extension
export const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

// Is image file
export const isImageFile = (mimetype) => {
  return mimetype.startsWith("image/");
};

// Is PDF file
export const isPdfFile = (mimetype) => {
  return mimetype === "application/pdf";
};

// Is document file
export const isDocumentFile = (mimetype) => {
  const documentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];
  
  return documentTypes.includes(mimetype);
};

// Document upload service for registration
export const processRegistrationDocument = async (file, docType, registrationId) => {
  try {
    // Validate document type
    if (!validateDocumentType(docType)) {
      throw new Error("Invalid document type");
    }

    // Check file size
    if (!checkFileSize(file)) {
      throw new Error("File size exceeds maximum limit (5MB)");
    }

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(file.path, `registrations/${registrationId}`);

    // Return document info
    return {
      type: docType,
      fileName: file.originalname,
      fileUrl: cloudinaryResult.url,
      publicId: cloudinaryResult.publicId,
      size: cloudinaryResult.size,
      format: cloudinaryResult.format,
      uploadedAt: new Date()
    };

  } catch (error) {
    console.error("Process registration document error:", error);
    
    // Clean up local file if it exists
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    throw error;
  }
};

// Process multiple registration documents
export const processMultipleRegistrationDocuments = async (files, registrationId) => {
  try {
    const documents = [];
    
    for (const file of files) {
      // Extract document type from field name or request body
      const docType = file.fieldname.replace('document_', '');
      
      if (!validateDocumentType(docType)) {
        throw new Error(`Invalid document type: ${docType}`);
      }

      const documentInfo = await processRegistrationDocument(file, docType, registrationId);
      documents.push(documentInfo);
    }

    return documents;

  } catch (error) {
    console.error("Process multiple registration documents error:", error);
    throw error;
  }
};

// Verify document exists and is accessible
export const verifyDocumentAccess = async (fileUrl) => {
  try {
    // For Cloudinary URLs, we can make a HEAD request to verify
    const response = await fetch(fileUrl, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.error("Verify document access error:", error);
    return false;
  }
};

// Get document statistics
export const getDocumentStatistics = async (registrationId) => {
  try {
    // This would typically query the database for document statistics
    // For now, return a placeholder structure
    return {
      totalDocuments: 0,
      uploadedDocuments: 0,
      pendingDocuments: 0,
      verifiedDocuments: 0,
      rejectedDocuments: 0,
      totalSize: 0
    };
  } catch (error) {
    console.error("Get document statistics error:", error);
    throw error;
  }
};

export default {
  uploadSingle,
  uploadMultiple,
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  deleteFromCloudinary,
  validateDocumentType,
  getFileInfo,
  cleanupLocalFiles,
  generateUniqueFilename,
  checkFileSize,
  getFileExtension,
  isImageFile,
  isPdfFile,
  isDocumentFile,
  processRegistrationDocument,
  processMultipleRegistrationDocuments,
  verifyDocumentAccess,
  getDocumentStatistics
};
