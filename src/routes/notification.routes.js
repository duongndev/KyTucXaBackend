import express from "express";
import * as notificationContrl from "../controllers/notification/notification.controller.js";
import { authorize, protect } from "../middlewares/auth.middlewares.js";

const router = express.Router();

// ==================== USER ROUTES ====================

router.use(protect);

// Lấy danh sách thông báo của người dùng
router.get("/", notificationContrl.getMyNotifications);

// Lấy số lượng thông báo chưa đọc
router.get("/unread-count", notificationContrl.getUnreadCount);

// Lấy thống kê thông báo
router.get("/stats", notificationContrl.getNotificationStats);

// Lấy chi tiết một thông báo
router.get("/:id", notificationContrl.getNotificationById);

// Đánh dấu thông báo đã đọc
router.patch("/:id/read", notificationContrl.markAsRead);

// Đánh dấu tất cả thông báo đã đọc
router.patch("/read-all", notificationContrl.markAllAsRead);

// Xóa một thông báo
router.delete("/:id", notificationContrl.deleteNotification);

// Xóa tất cả thông báo đã đọc
router.delete("/read-all", notificationContrl.deleteAllRead);

// ==================== PREFERENCES ROUTES ====================

// Lấy cài đặt thông báo
router.get("/preferences", notificationContrl.getPreferences);

// Cập nhật cài đặt thông báo
router.patch("/preferences", notificationContrl.updatePreferences);

// Cập nhật FCM token
router.post("/fcm-token", notificationContrl.updateFCMToken);

// Xóa FCM token
router.delete("/fcm-token", notificationContrl.removeFCMToken);

// ==================== ADMIN ROUTES ====================

// Gửi thông báo đến nhiều người dùng
router.post("/send-to-users", authorize("admin"), notificationContrl.sendToUsers);

// Gửi thông báo đến tất cả người dùng
router.post("/send-to-all", authorize("admin"), notificationContrl.sendToAllUsers);

// Tạo thông báo mới
router.post("/create", authorize("admin"), notificationContrl.createNotification);

// Lấy tất cả thông báo (admin)
router.get("/admin/all", notificationContrl.getAllNotifications);

// Lấy thống kê hệ thống (admin)
router.get("/admin/stats", notificationContrl.getSystemStats);

// Dọn dẹp thông báo hết hạn (admin)
router.delete("/admin/cleanup", notificationContrl.cleanupExpired);

export default router;
