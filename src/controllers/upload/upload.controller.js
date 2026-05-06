/**
 * upload.controller.js
 *
 * Xử lý các endpoint upload file lên Cloudinary với cấu trúc thư mục theo user:
 *
 *   POST /api/upload/image        → 1 ảnh
 *   POST /api/upload/document     → 1 tài liệu (PDF / Word)
 *   POST /api/upload/avatar       → 1 ảnh đại diện
 *   POST /api/upload/multiple     → nhiều file hỗn hợp (tối đa 10)
 *   DELETE /api/upload            → xoá file theo publicId
 *
 * Folder trên Cloudinary:
 *   KyTucXa/{userId}/images/     ← ảnh thường
 *   KyTucXa/{userId}/documents/  ← tài liệu
 *   KyTucXa/{userId}/avatars/    ← avatar
 */

import {
  uploadImage,
  uploadDocument,
  uploadAvatar,
  uploadMultiple,
  deleteFile,
} from "../../services/cloudinaryUpload.service.js";
import {
  successResponse,
  createdResponse,
  errorResponse,
  badRequestResponse,
} from "../../utils/response.js";
import { logSecurityEvent } from "../../utils/security.logger.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lấy userId từ token đã xác thực (được set bởi protect middleware).
 * Dùng _id để làm tên folder trên Cloudinary.
 */
const getUserId = (req) => req.user?._id?.toString();

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/upload/image
 * Upload 1 ảnh cho user đang đăng nhập.
 *
 * Form-data:
 *   - image: file (jpeg/png/webp/gif)
 *
 * Response:
 *   { url, publicId, folder, format, width, height, sizeBytes }
 */
export const uploadImageController = async (req, res) => {
  try {
    if (!req.file) {
      return badRequestResponse(res, "Chưa chọn file ảnh. Vui lòng gửi file qua field 'image'.");
    }

    const userId = getUserId(req);

    const result = await uploadImage(req.file.path, userId, req.file.originalname);

    await logSecurityEvent("FILE_UPLOAD_SUCCESS", {
      userId,
      type: "image",
      originalname: req.file.originalname,
      sizeBytes: req.file.size,
      url: result.url,
    }, req);

    return createdResponse(res, "Upload ảnh thành công", result);
  } catch (error) {
    console.error("[UploadController] uploadImage error:", error);

    await logSecurityEvent("FILE_UPLOAD_ERROR", {
      userId: getUserId(req),
      type: "image",
      error: error.message,
    }, req).catch(() => {});

    return errorResponse(res, error.message, 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/upload/document
 * Upload 1 tài liệu cho user đang đăng nhập.
 *
 * Form-data:
 *   - document: file (pdf/doc/docx)
 *
 * Response:
 *   { url, publicId, folder, format, sizeBytes }
 */
export const uploadDocumentController = async (req, res) => {
  try {
    if (!req.file) {
      return badRequestResponse(
        res,
        "Chưa chọn tài liệu. Vui lòng gửi file qua field 'document'."
      );
    }

    const userId = getUserId(req);

    const result = await uploadDocument(req.file.path, userId, req.file.originalname);

    await logSecurityEvent("FILE_UPLOAD_SUCCESS", {
      userId,
      type: "document",
      originalname: req.file.originalname,
      sizeBytes: req.file.size,
      url: result.url,
    }, req);

    return createdResponse(res, "Upload tài liệu thành công", result);
  } catch (error) {
    console.error("[UploadController] uploadDocument error:", error);

    await logSecurityEvent("FILE_UPLOAD_ERROR", {
      userId: getUserId(req),
      type: "document",
      error: error.message,
    }, req).catch(() => {});

    return errorResponse(res, error.message, 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/upload/avatar
 * Upload / thay thế ảnh đại diện của user.
 * Avatar được crop 400×400 và ghi đè file cũ trên Cloudinary.
 *
 * Form-data:
 *   - avatar: file (jpeg/png/webp/gif)
 *
 * Response:
 *   { url, publicId, folder, format, width, height, sizeBytes }
 */
export const uploadAvatarController = async (req, res) => {
  try {
    if (!req.file) {
      return badRequestResponse(
        res,
        "Chưa chọn ảnh đại diện. Vui lòng gửi file qua field 'avatar'."
      );
    }

    const userId = getUserId(req);

    const result = await uploadAvatar(req.file.path, userId);

    await logSecurityEvent("FILE_UPLOAD_SUCCESS", {
      userId,
      type: "avatar",
      originalname: req.file.originalname,
      sizeBytes: req.file.size,
      url: result.url,
    }, req);

    return createdResponse(res, "Upload avatar thành công", result);
  } catch (error) {
    console.error("[UploadController] uploadAvatar error:", error);

    await logSecurityEvent("FILE_UPLOAD_ERROR", {
      userId: getUserId(req),
      type: "avatar",
      error: error.message,
    }, req).catch(() => {});

    return errorResponse(res, error.message, 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/upload/multiple
 * Upload nhiều file hỗn hợp (ảnh + tài liệu) cùng lúc, tối đa 10 file.
 *
 * Form-data:
 *   - files: file[] (mảng file)
 *
 * Response:
 *   {
 *     uploaded: [{ url, publicId, ... }],
 *     failed:   [{ originalname, error }],
 *     summary: { total, success, failed }
 *   }
 */
export const uploadMultipleController = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return badRequestResponse(
        res,
        "Chưa chọn file. Vui lòng gửi file qua field 'files'."
      );
    }

    const userId = getUserId(req);

    const { uploaded, failed } = await uploadMultiple(req.files, userId);

    await logSecurityEvent("FILE_UPLOAD_SUCCESS", {
      userId,
      type: "multiple",
      total: req.files.length,
      success: uploaded.length,
      failedCount: failed.length,
    }, req);

    const statusCode = uploaded.length === 0 ? 400 : 201;
    const message =
      uploaded.length === 0
        ? "Không có file nào được upload thành công"
        : `Upload thành công ${uploaded.length}/${req.files.length} file`;

    return res.status(statusCode).json({
      success: uploaded.length > 0,
      message,
      data: {
        uploaded,
        failed,
        summary: {
          total: req.files.length,
          success: uploaded.length,
          failed: failed.length,
        },
      },
    });
  } catch (error) {
    console.error("[UploadController] uploadMultiple error:", error);

    await logSecurityEvent("FILE_UPLOAD_ERROR", {
      userId: getUserId(req),
      type: "multiple",
      error: error.message,
    }, req).catch(() => {});

    return errorResponse(res, error.message, 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/upload
 * Xoá file khỏi Cloudinary.
 *
 * Body:
 *   {
 *     publicId: string,       // public_id của file trên Cloudinary (bắt buộc hoặc dùng url)
 *     url: string,            // hoặc dùng URL thay cho publicId
 *     resourceType: "image"|"raw"   // mặc định: "image"
 *   }
 *
 * Response:
 *   { result: "ok" }
 */
export const deleteFileController = async (req, res) => {
  try {
    const { publicId, url, resourceType = "image" } = req.body;

    const identifier = publicId || url;
    if (!identifier) {
      return badRequestResponse(res, "Vui lòng cung cấp 'publicId' hoặc 'url' của file cần xoá.");
    }

    // Validate resourceType
    if (!["image", "raw", "video"].includes(resourceType)) {
      return badRequestResponse(res, "resourceType không hợp lệ. Chỉ chấp nhận: image, raw, video.");
    }

    const result = await deleteFile(identifier, resourceType);

    if (result?.result !== "ok") {
      return errorResponse(res, "File không tồn tại hoặc không thể xoá.", 404);
    }

    await logSecurityEvent("FILE_DELETE_SUCCESS", {
      userId: getUserId(req),
      identifier,
      resourceType,
    }, req);

    return successResponse(res, "Xoá file thành công", { result: result.result });
  } catch (error) {
    console.error("[UploadController] deleteFile error:", error);

    await logSecurityEvent("FILE_DELETE_ERROR", {
      userId: getUserId(req),
      error: error.message,
    }, req).catch(() => {});

    return errorResponse(res, error.message, 500);
  }
};
