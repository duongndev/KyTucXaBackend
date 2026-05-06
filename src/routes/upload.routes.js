/**
 * upload.routes.js
 *
 * Routes upload file lên Cloudinary.
 * Tất cả routes đều yêu cầu xác thực (protect middleware).
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │ Method │ Path                    │ Mô tả                       │
 * ├────────────────────────────────────────────────────────────────┤
 * │ POST   │ /api/upload/image       │ Upload 1 ảnh                │
 * │ POST   │ /api/upload/document    │ Upload 1 tài liệu            │
 * │ POST   │ /api/upload/avatar      │ Upload / thay avatar         │
 * │ POST   │ /api/upload/multiple    │ Upload nhiều file (tối đa 10)│
 * │ DELETE │ /api/upload             │ Xoá file theo publicId/url   │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Cloudinary folder structure:
 *   KyTucXa/{userId}/images/     ← ảnh thường
 *   KyTucXa/{userId}/documents/  ← tài liệu (pdf, doc, docx)
 *   KyTucXa/{userId}/avatars/    ← avatar (crop 400×400)
 */

import express from "express";
import { protect } from "../middlewares/auth.middlewares.js";
import {
  uploadImageMiddleware,
  uploadDocumentMiddleware,
  uploadAvatarMiddleware,
  uploadMultipleMiddleware,
  handleUploadError,
} from "../middlewares/cloudinaryUpload.middleware.js";
import {
  uploadImageController,
  uploadDocumentController,
  uploadAvatarController,
  uploadMultipleController,
  deleteFileController,
} from "../controllers/upload/upload.controller.js";

const router = express.Router();

// ─── Tất cả routes đều cần xác thực ──────────────────────────────────────────
router.use(protect);

// ─── Upload ảnh ───────────────────────────────────────────────────────────────
/**
 * POST /api/upload/image
 * Content-Type: multipart/form-data
 * Field: image  (jpeg | png | webp | gif, tối đa 5MB)
 */
router.post(
  "/image",
  uploadImageMiddleware,
  handleUploadError,
  uploadImageController
);

// ─── Upload tài liệu ──────────────────────────────────────────────────────────
/**
 * POST /api/upload/document
 * Content-Type: multipart/form-data
 * Field: document  (pdf | doc | docx, tối đa 10MB)
 */
router.post(
  "/document",
  uploadDocumentMiddleware,
  handleUploadError,
  uploadDocumentController
);

// ─── Upload avatar ────────────────────────────────────────────────────────────
/**
 * POST /api/upload/avatar
 * Content-Type: multipart/form-data
 * Field: avatar  (jpeg | png | webp | gif, tối đa 5MB)
 * Ghi chú: Avatar được crop 400×400 và ghi đè ảnh cũ.
 */
router.post(
  "/avatar",
  uploadAvatarMiddleware,
  handleUploadError,
  uploadAvatarController
);

// ─── Upload nhiều file ────────────────────────────────────────────────────────
/**
 * POST /api/upload/multiple
 * Content-Type: multipart/form-data
 * Field: files[]  (ảnh hoặc tài liệu, tối đa 10 file)
 */
router.post(
  "/multiple",
  uploadMultipleMiddleware,
  handleUploadError,
  uploadMultipleController
);

// ─── Xoá file ─────────────────────────────────────────────────────────────────
/**
 * DELETE /api/upload
 * Content-Type: application/json
 * Body: { publicId?: string, url?: string, resourceType?: "image"|"raw" }
 */
router.delete("/", deleteFileController);

export default router;
