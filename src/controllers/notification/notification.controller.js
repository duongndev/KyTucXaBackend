import Notification from "../../models/notification/notification.model.js";
import NotificationPreference from "../../models/notification/notificationPreference.model.js";
import * as notificationService from "../../services/notification.service.js";

/**
 * Lấy danh sách thông báo của người dùng hiện tại
 * @route GET /api/notifications
 */
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, unreadOnly, category, type } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === "true",
      category,
      type
    };

    const notifications = await Notification.findByRecipient(userId, options);
    const total = await Notification.countDocuments({
      recipient: userId,
      ...(unreadOnly === "true" && { isRead: false }),
      ...(category && { category }),
      ...(type && { type })
    });

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách thông báo",
      error: error.message
    });
  }
};

/**
 * Lấy số lượng thông báo chưa đọc
 * @route GET /api/notifications/unread-count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Notification.findUnreadCount(userId);

    res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy số lượng thông báo chưa đọc",
      error: error.message
    });
  }
};

/**
 * Lấy chi tiết một thông báo
 * @route GET /api/notifications/:id
 */
export const getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: id,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo"
      });
    }

    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thông báo",
      error: error.message
    });
  }
};

/**
 * Đánh dấu thông báo đã đọc
 * @route PATCH /api/notifications/:id/read
 */
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: id,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo"
      });
    }

    await notification.markAsRead();

    res.status(200).json({
      success: true,
      message: "Đã đánh dấu thông báo là đã đọc",
      data: notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi đánh dấu thông báo đã đọc",
      error: error.message
    });
  }
};

/**
 * Đánh dấu tất cả thông báo đã đọc
 * @route PATCH /api/notifications/read-all
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: "Đã đánh dấu tất cả thông báo là đã đọc",
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi đánh dấu tất cả thông báo đã đọc",
      error: error.message
    });
  }
};

/**
 * Xóa một thông báo
 * @route DELETE /api/notifications/:id
 */
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông báo"
      });
    }

    res.status(200).json({
      success: true,
      message: "Đã xóa thông báo"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa thông báo",
      error: error.message
    });
  }
};

/**
 * Xóa tất cả thông báo đã đọc
 * @route DELETE /api/notifications/read-all
 */
export const deleteAllRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.deleteMany({
      recipient: userId,
      isRead: true
    });

    res.status(200).json({
      success: true,
      message: "Đã xóa tất cả thông báo đã đọc",
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa thông báo",
      error: error.message
    });
  }
};

/**
 * Lấy thống kê thông báo
 * @route GET /api/notifications/stats
 */
export const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const stats = await Notification.getNotificationStats(userId);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê thông báo",
      error: error.message
    });
  }
};

// ==================== PREFERENCES ====================

/**
 * Lấy cài đặt thông báo của người dùng
 * @route GET /api/notifications/preferences
 */
export const getPreferences = async (req, res) => {
  try {
    const userId = req.user._id;

    let preferences = await NotificationPreference.findByUser(userId);

    if (!preferences) {
      preferences = await NotificationPreference.createDefaultPreferences(userId);
    }

    res.status(200).json({
      success: true,
      data: preferences
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy cài đặt thông báo",
      error: error.message
    });
  }
};

/**
 * Cập nhật cài đặt thông báo
 * @route PATCH /api/notifications/preferences
 */
export const updatePreferences = async (req, res) => {
  try {
    const userId = req.user._id;
    const updates = req.body;

    const preferences = await NotificationPreference.findOneAndUpdate(
      { user: userId },
      { $set: updates },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Đã cập nhật cài đặt thông báo",
      data: preferences
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật cài đặt thông báo",
      error: error.message
    });
  }
};

/**
 * Cập nhật FCM token
 * @route POST /api/notifications/fcm-token
 */
export const updateFCMToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fcmToken, deviceId, deviceType, platform } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token là bắt buộc"
      });
    }

    const deviceInfo = {
      deviceId: deviceId || `device_${Date.now()}`,
      deviceType: deviceType || "web",
      platform: platform || "web",
      fcmToken
    };

    const preferences = await NotificationPreference.addDevice(userId, deviceInfo);

    res.status(200).json({
      success: true,
      message: "Đã cập nhật FCM token",
      data: preferences
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật FCM token",
      error: error.message
    });
  }
};

/**
 * Xóa FCM token
 * @route DELETE /api/notifications/fcm-token
 */
export const removeFCMToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device ID là bắt buộc"
      });
    }

    const preferences = await NotificationPreference.removeDevice(userId, deviceId);

    res.status(200).json({
      success: true,
      message: "Đã xóa FCM token",
      data: preferences
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa FCM token",
      error: error.message
    });
  }
};

// ==================== ADMIN ====================

/**
 * Gửi thông báo đến nhiều người dùng (Admin)
 * @route POST /api/notifications/send-to-users
 */
export const sendToUsers = async (req, res) => {
  try {
    const { userIds, title, content, type = "INFO", category = "SYSTEM", priority = "MEDIUM", actionUrl, data } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách userIds là bắt buộc"
      });
    }

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Tiêu đề và nội dung là bắt buộc"
      });
    }

    const notificationData = {
      title,
      content,
      type,
      category,
      priority,
      actionUrl,
      data
    };

    const notifications = await notificationService.sendToUsers(userIds, notificationData);

    res.status(200).json({
      success: true,
      message: `Đã gửi thông báo đến ${notifications.length} người dùng`,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi gửi thông báo",
      error: error.message
    });
  }
};

/**
 * Gửi thông báo đến tất cả người dùng (Admin)
 * @route POST /api/notifications/send-to-all
 */
export const sendToAllUsers = async (req, res) => {
  try {
    // Kiểm tra quyền admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có quyền gửi thông báo đến tất cả người dùng"
      });
    }

    const { title, content, type = "INFO", category = "ANNOUNCEMENT", priority = "MEDIUM", actionUrl, data } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Tiêu đề và nội dung là bắt buộc"
      });
    }

    const notificationData = {
      title,
      content,
      type,
      category,
      priority,
      actionUrl,
      data
    };

    const notifications = await notificationService.sendToAllUsers(notificationData);

    console.log("notifications: ", notifications);

    res.status(200).json({
      success: true,
      message: `Đã gửi thông báo đến ${notifications.length} người dùng`,
      data: notifications
    });
  } catch (error) {
    console.error("Lỗi khi gửi thông báo đến tất cả người dùng:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi khi gửi thông báo",
      error: error.message
    });
  }
};

/**
 * Tạo thông báo mới (Admin)
 * @route POST /api/notifications/create
 */
export const createNotification = async (req, res) => {
  try {
    const { recipient, title, content, type = "INFO", category = "SYSTEM", priority = "MEDIUM", actionUrl, relatedResource, metadata, scheduledFor, expiresAt } = req.body;

    if (!recipient || !title || !content) {
      return res.status(400).json({
        success: false,
        message: "Người nhận, tiêu đề và nội dung là bắt buộc"
      });
    }

    const notification = new Notification({
      recipient,
      title,
      content,
      type,
      category,
      priority,
      actionUrl,
      relatedResource,
      metadata,
      scheduledFor,
      expiresAt
    });

    await notification.save();

    res.status(201).json({
      success: true,
      message: "Đã tạo thông báo",
      data: notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi tạo thông báo",
      error: error.message
    });
  }
};

/**
 * Lấy tất cả thông báo (Admin)
 * @route GET /api/notifications/admin/all
 */
export const getAllNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, type, isRead } = req.query;

    const filter = {};
    if (category) filter.category = category;
    if (type) filter.type = type;
    if (isRead !== undefined) filter.isRead = isRead === "true";

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const notifications = await Notification.find(filter)
      .populate("recipient", "_id fullName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách thông báo",
      error: error.message
    });
  }
};

/**
 * Lấy thống kê hệ thống (Admin)
 * @route GET /api/notifications/admin/stats
 */
export const getSystemStats = async (req, res) => {
  try {
    const stats = await Notification.getNotificationStats();

    const totalCount = await Notification.countDocuments();
    const unreadCount = await Notification.countDocuments({ isRead: false });
    const pushSentCount = await Notification.countDocuments({ isPushSent: true });
    const emailSentCount = await Notification.countDocuments({ isEmailSent: true });

    res.status(200).json({
      success: true,
      data: {
        byCategory: stats,
        summary: {
          total: totalCount,
          unread: unreadCount,
          pushSent: pushSentCount,
          emailSent: emailSentCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thống kê hệ thống",
      error: error.message
    });
  }
};

/**
 * Dọn dẹp thông báo hết hạn (Admin)
 * @route DELETE /api/notifications/admin/cleanup
 */
export const cleanupExpired = async (req, res) => {
  try {
    const result = await Notification.cleanupExpiredNotifications();

    res.status(200).json({
      success: true,
      message: "Đã dọn dẹp thông báo hết hạn",
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi dọn dẹp thông báo",
      error: error.message
    });
  }
};
