import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import cloudinary from "../config/cloudinary.config.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Root folder trên Cloudinary */
const ROOT_FOLDER = "KyTucXa";

/** Sub-folder theo loại tài nguyên */
const FOLDER_TYPE = {
  image: "images",
  document: "documents",
  avatar: "avatars",
  signature: "signatures",
};

/** MIME types được chấp nhận */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Giới hạn dung lượng */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;      // 5 MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;  // 10 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tạo đường dẫn Cloudinary folder theo user:
 * KyTucXa/{userId}/images   hoặc
 * KyTucXa/{userId}/documents
 */
const buildFolder = (userId, type = "image") => {
  const sub = FOLDER_TYPE[type] ?? FOLDER_TYPE.image;
  return `${ROOT_FOLDER}/${userId}/${sub}`;
};

/**
 * Tạo public_id duy nhất (giữ tên file gốc + timestamp + random).
 * public_id KHÔNG bao gồm extension – Cloudinary tự quản lý.
 */
const buildPublicId = (originalname) => {
  const base = path
    .basename(originalname, path.extname(originalname))
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 40);
  const ts = Date.now();
  const rand = crypto.randomBytes(6).toString("hex");
  return `${base}_${ts}_${rand}`;
};

/** Xoá file local (silent). */
const cleanup = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_) {
    // ignore
  }
};

/** Trích public_id từ secure_url của Cloudinary. */
const extractPublicId = (secureUrl) => {
  try {
    const parts = secureUrl.split("/");
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx === -1) return null;

    // bỏ version (vXXXX)
    const afterUpload = parts.slice(uploadIdx + 1);
    if (/^v\d+$/.test(afterUpload[0])) afterUpload.shift();

    const withExt = afterUpload.join("/");
    return withExt.replace(/\.[^/.]+$/, "");
  } catch (_) {
    return null;
  }
};

// ─── Core upload functions ───────────────────────────────────────────────────

/**
 * Upload **ảnh** lên Cloudinary.
 *
 * @param {string} filePath   - Đường dẫn file tạm trên server
 * @param {string} userId     - ID của user (dùng làm tên folder)
 * @param {string} originalname
 * @param {object} [options]  - Tuỳ chọn thêm truyền vào Cloudinary
 * @returns {Promise<UploadResult>}
 */
export const uploadImage = async (filePath, userId, originalname, options = {}) => {
  const folder = buildFolder(userId, "image");
  const publicId = buildPublicId(originalname);

  try {
    const result = await cloudinary.v2.uploader.upload(filePath, {
      folder,
      public_id: publicId,
      resource_type: "image",
      overwrite: false,
      quality: "auto",
      fetch_format: "auto",
      ...options,
    });

    await cleanup(filePath);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
      format: result.format,
      width: result.width,
      height: result.height,
      sizeBytes: result.bytes,
      resourceType: "image",
    };
  } catch (error) {
    await cleanup(filePath);
    throw new Error(`Upload ảnh thất bại: ${error.message}`);
  }
};

/**
 * Upload **tài liệu** (PDF / Word …) lên Cloudinary.
 *
 * @param {string} filePath
 * @param {string} userId
 * @param {string} originalname
 * @param {object} [options]
 * @returns {Promise<UploadResult>}
 */
export const uploadDocument = async (filePath, userId, originalname, options = {}) => {
  const folder = buildFolder(userId, "document");
  const publicId = buildPublicId(originalname);

  try {
    const result = await cloudinary.v2.uploader.upload(filePath, {
      folder,
      public_id: publicId,
      resource_type: "raw",   // raw = non-image / non-video
      overwrite: false,
      ...options,
    });

    await cleanup(filePath);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
      format: result.format,
      sizeBytes: result.bytes,
      resourceType: "raw",
    };
  } catch (error) {
    await cleanup(filePath);
    throw new Error(`Upload tài liệu thất bại: ${error.message}`);
  }
};

/**
 * Upload **avatar** người dùng.
 * Avatar ghi đè file cũ (dùng public_id cố định theo userId).
 *
 * @param {string} filePath
 * @param {string} userId
 * @returns {Promise<UploadResult>}
 */
export const uploadAvatar = async (filePath, userId) => {
  const folder = buildFolder(userId, "avatar");
  const publicId = `avatar_${userId}`;

  try {
    const result = await cloudinary.v2.uploader.upload(filePath, {
      folder,
      public_id: publicId,
      resource_type: "image",
      overwrite: true,          // avatar ghi đè ảnh cũ
      quality: "auto",
      fetch_format: "auto",
      transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    });

    await cleanup(filePath);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
      format: result.format,
      width: result.width,
      height: result.height,
      sizeBytes: result.bytes,
      resourceType: "image",
    };
  } catch (error) {
    await cleanup(filePath);
    throw new Error(`Upload avatar thất bại: ${error.message}`);
  }
};

/**
 * Upload nhiều files cùng lúc (mixed: ảnh + tài liệu).
 *
 * @param {Array<{path, originalname, mimetype}>} files
 * @param {string} userId
 * @returns {Promise<Array<UploadResult>>}
 */
export const uploadMultiple = async (files, userId) => {
  const results = await Promise.allSettled(
    files.map((file) => {
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
      if (isImage) return uploadImage(file.path, userId, file.originalname);
      return uploadDocument(file.path, userId, file.originalname);
    })
  );

  const uploaded = [];
  const failed = [];

  results.forEach((res, idx) => {
    if (res.status === "fulfilled") {
      uploaded.push({ ...res.value, originalname: files[idx].originalname });
    } else {
      failed.push({ originalname: files[idx].originalname, error: res.reason?.message });
      // Cố gắng dọn dẹp file local nếu chưa xoá
      cleanup(files[idx].path);
    }
  });

  return { uploaded, failed };
};

// ─── Authenticated Signature Delivery ─────────────────────────────────

/**
 * Upload chữ ký dạng Base64 lên Cloudinary dưới dạng ẩn (authenticated).
 *
 * @param {string} base64Data Chuỗi base64 của chữ ký
 * @param {string} userId ID của user
 * @returns {Promise<UploadResult>}
 */
export const uploadSignatureBase64 = async (base64Data, userId) => {
  const folder = buildFolder(userId, "signature");
  const publicId = `signature_${userId}_${Date.now()}`;

  try {
    const result = await cloudinary.v2.uploader.upload(base64Data, {
      folder,
      public_id: publicId,
      resource_type: "image",
      type: "authenticated",    // QUAN TRỌNG: Thiết lập ẩn
      overwrite: true,
      quality: "auto",
      fetch_format: "auto",
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
      format: result.format,
      sizeBytes: result.bytes,
      resourceType: "image",
    };
  } catch (error) {
    throw new Error(`Upload chữ ký thất bại: ${error.message}`);
  }
};

/**
 * Tạo Signed URL có thời hạn cho phép hiển thị ảnh chữ ký "authenticated"
 *
 * @param {string} publicId Mã publicId của chữ ký
 * @param {number} expiresInSeconds Thời gian sống của link (mặc định: 3600s = 1 giờ)
 * @returns {string} URL đã được ký (Signed URL)
 */
export const getSignedSignatureUrl = (publicId, expiresInSeconds = 3600) => {
  if (!publicId) return null;
  // Tính expiration time dính vào URL
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  
  return cloudinary.v2.url(publicId, {
    sign_url: true,
    type: "authenticated",
    secure: true,
    expires_at: expiresAt
  });
};

// ─── Authenticated Document Delivery (CCCD / Thẻ SV) ─────────────────────────

/**
 * Danh sách loại giấy tờ cần ẩn (type=authenticated).
 * Các loại không nằm trong danh sách này vẫn upload public bình thường.
 */
export const SENSITIVE_DOC_TYPES = ["cccd_front", "cccd_back", "student_card"];

/**
 * Upload file giấy tờ nhạy cảm (CCCD, thẻ SV) lên Cloudinary
 * dưới chế độ authenticated — ẩn hoàn toàn với công chúng.
 *
 * @param {string} filePath  Đường dẫn file tạm trên server (từ multer diskStorage)
 * @param {string} userId    ID của user
 * @param {string} docType   Loại giấy tờ (cccd_front | cccd_back | student_card)
 * @param {string} originalname  Tên file gốc
 * @returns {Promise<{url, publicId, folder, format, sizeBytes}>}
 */
export const uploadSensitiveDocument = async (filePath, userId, docType, originalname) => {
  const folder = `${ROOT_FOLDER}/${userId}/sensitive_docs`;
  const publicId = buildPublicId(`${docType}_${originalname}`);

  try {
    const result = await cloudinary.v2.uploader.upload(filePath, {
      folder,
      public_id: publicId,
      resource_type: "image",
      type: "authenticated",   // Ẩn hoàn toàn — chặn truy cập công khai
      overwrite: false,
      quality: "auto",
      fetch_format: "auto",
    });

    await cleanup(filePath);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
      format: result.format,
      sizeBytes: result.bytes,
      resourceType: "image",
    };
  } catch (error) {
    await cleanup(filePath);
    throw new Error(`Upload giấy tờ nhạy cảm thất bại: ${error.message}`);
  }
};

/**
 * Tạo Signed URL có thời hạn để hiển thị ảnh giấy tờ nhạy cảm.
 * Mặc định sống 30 phút — đủ để Admin xem xét, frontend load.
 *
 * @param {string} publicId        Mã publicId lưu trong DB
 * @param {number} expiresInSeconds Thời gian sống (mặc định: 1800s = 30 phút)
 * @returns {string|null}
 */
export const getSignedDocumentUrl = (publicId, expiresInSeconds = 1800) => {
  if (!publicId) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return cloudinary.v2.url(publicId, {
    sign_url: true,
    type: "authenticated",
    secure: true,
    expires_at: expiresAt
  });
};

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Xoá file khỏi Cloudinary theo publicId hoặc URL.
 *
 * @param {string} identifier    - public_id hoặc secure_url
 * @param {"image"|"raw"} [resourceType]
 */
export const deleteFile = async (identifier, resourceType = "image") => {
  try {
    let publicId = identifier;

    // Nếu là URL thì trích public_id
    if (identifier.startsWith("http")) {
      publicId = extractPublicId(identifier);
      if (!publicId) throw new Error("Không thể trích public_id từ URL");

      // Với raw resource thì resource_type = "raw"
      resourceType = identifier.includes("/raw/") ? "raw" : "image";
    }

    const result = await cloudinary.v2.uploader.destroy(publicId, { resource_type: resourceType });
    return result; // { result: 'ok' } hoặc { result: 'not found' }
  } catch (error) {
    throw new Error(`Xoá file thất bại: ${error.message}`);
  }
};

// ─── Validation helpers (dùng trong middleware) ────────────────────────────

export const isAllowedImageType = (mimetype) => ALLOWED_IMAGE_TYPES.includes(mimetype);
export const isAllowedDocumentType = (mimetype) => ALLOWED_DOCUMENT_TYPES.includes(mimetype);
export const isAllowedType = (mimetype) =>
  isAllowedImageType(mimetype) || isAllowedDocumentType(mimetype);

export const getMaxSize = (mimetype) => {
  if (isAllowedImageType(mimetype)) return MAX_IMAGE_SIZE;
  if (isAllowedDocumentType(mimetype)) return MAX_DOCUMENT_SIZE;
  return 0;
};

export {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_IMAGE_SIZE,
  MAX_DOCUMENT_SIZE,
  ROOT_FOLDER,
  FOLDER_TYPE,
};
