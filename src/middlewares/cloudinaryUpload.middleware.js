/**
 * cloudinaryUpload.middleware.js
 *
 * Middleware dùng multer (memory storage) để nhận file từ request,
 * sau đó controller sẽ gọi service để đẩy lên Cloudinary.
 *
 * Phân loại endpoint:
 *  - POST /upload/image     → field "image"   (1 ảnh)
 *  - POST /upload/document  → field "document" (1 tài liệu)
 *  - POST /upload/avatar    → field "avatar"   (1 ảnh đại diện)
 *  - POST /upload/multiple  → field "files"    (nhiều file, tối đa 10)
 */

import multer from "multer";
import path from "path";
import { errorResponse } from "../utils/response.js";
import {
  isAllowedImageType,
  isAllowedDocumentType,
  isAllowedType,
  getMaxSize,
  MAX_IMAGE_SIZE,
  MAX_DOCUMENT_SIZE,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
} from "../services/cloudinaryUpload.service.js";

// ─── Multer – dùng memory storage (không lưu file tạm ra disk khi dùng stream upload) ─
// Tuy nhiên với Cloudinary SDK (upload bằng file path) ta vẫn dùng diskStorage
// để có thể truyền path vào uploader.upload(). Thư mục temp được tạo tự động.

import fs from "fs/promises";

const TEMP_DIR = "src/temp/uploads";

/** Đảm bảo thư mục temp tồn tại */
const ensureTempDir = async () => {
  await fs.mkdir(TEMP_DIR, { recursive: true });
};
ensureTempDir().catch(console.error);

// ─── Disk storage (lưu file tạm) ─────────────────────────────────────────────

const diskStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await ensureTempDir();
      cb(null, TEMP_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${ext}`);
  },
});

// ─── File filters ─────────────────────────────────────────────────────────────

/** Chỉ chấp nhận ảnh */
const imageFileFilter = (_req, file, cb) => {
  if (!isAllowedImageType(file.mimetype)) {
    const err = new Error(
      `Loại file không hợp lệ. Chỉ chấp nhận: ${ALLOWED_IMAGE_TYPES.join(", ")}`
    );
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
};

/** Chỉ chấp nhận tài liệu */
const documentFileFilter = (_req, file, cb) => {
  if (!isAllowedDocumentType(file.mimetype)) {
    const err = new Error(
      `Loại file không hợp lệ. Chỉ chấp nhận: ${ALLOWED_DOCUMENT_TYPES.join(", ")}`
    );
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
};

/** Chấp nhận cả ảnh lẫn tài liệu */
const mixedFileFilter = (_req, file, cb) => {
  if (!isAllowedType(file.mimetype)) {
    const err = new Error(
      `Loại file không hợp lệ. Chỉ chấp nhận ảnh hoặc tài liệu (PDF/Word).`
    );
    err.code = "INVALID_FILE_TYPE";
    return cb(err, false);
  }
  cb(null, true);
};

// ─── Multer instances ─────────────────────────────────────────────────────────

/** Upload 1 ảnh – field: "image" */
export const uploadImageMiddleware = multer({
  storage: diskStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
}).single("image");

/** Upload 1 tài liệu – field: "document" */
export const uploadDocumentMiddleware = multer({
  storage: diskStorage,
  fileFilter: documentFileFilter,
  limits: { fileSize: MAX_DOCUMENT_SIZE, files: 1 },
}).single("document");

/** Upload avatar – field: "avatar" */
export const uploadAvatarMiddleware = multer({
  storage: diskStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
}).single("avatar");

/** Upload nhiều file hỗn hợp – field: "files" (tối đa 10) */
export const uploadMultipleMiddleware = multer({
  storage: diskStorage,
  fileFilter: mixedFileFilter,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE, // giới hạn per-file (tài liệu lớn nhất)
    files: 10,
  },
}).array("files", 10);

// ─── Error handler ─────────────────────────────────────────────────────────────

/**
 * Xử lý lỗi multer và lỗi validation loại file.
 * Đặt sau route handler dưới dạng error-handling middleware (4 tham số).
 */
export const handleUploadError = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `File quá lớn. Ảnh tối đa ${MAX_IMAGE_SIZE / 1024 / 1024}MB, tài liệu tối đa ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB.`,
      LIMIT_FILE_COUNT: "Quá nhiều file. Tối đa 10 file mỗi lần upload.",
      LIMIT_UNEXPECTED_FILE: "Tên field không đúng. Dùng 'image', 'document', 'avatar', hoặc 'files'.",
    };
    return errorResponse(res, messages[err.code] ?? `Lỗi upload: ${err.message}`, 400);
  }

  if (err?.code === "INVALID_FILE_TYPE") {
    return errorResponse(res, err.message, 400);
  }

  next(err);
};

// ─── Wrapper để dùng multer trong async/await ──────────────────────────────────

/**
 * Bọc multer middleware thành Promise để có thể dùng trong controller.
 * Sử dụng kết hợp với handleUploadError.
 *
 * @example
 * await runMiddleware(req, res, uploadImageMiddleware);
 */
export const runMiddleware = (req, res, middleware) =>
  new Promise((resolve, reject) => {
    middleware(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
