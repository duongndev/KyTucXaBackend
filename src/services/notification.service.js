import admin from "../config/firebase.admin.config.js";
import Notification from "../models/notification.model.js";
import NotificationPreference from "../models/notificationPreference.model.js";
import User from "../models/user.model.js";
import Student from "../models/student.model.js";
import Registration from "../models/registration.model.js";

/**
 * Helper function to send FCM messages in batches
 * @param {Array} tokens - List of FCM tokens
 * @param {Object} messageData - Notification data
 */
const _sendFCMBatch = async (tokens, messageData) => {
  if (!tokens || tokens.length === 0) return;

  const BATCH_SIZE = 500;
  const batches = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    batches.push(tokens.slice(i, i + BATCH_SIZE));
  }

  for (const batchTokens of batches) {
    const messages = batchTokens.map((token) => ({
      notification: {
        title: messageData.title,
        body: messageData.content || messageData.message,
      },
      data: {
        type: messageData.type,
        click_action: "NOTIFICATION_CLICK",
        ...messageData.data,
      },
      token: token,
    }));

    try {
      if (messages.length > 0) {
        await admin.messaging().sendEach(messages);
      }
    } catch (error) {
      console.error("Error sending FCM batch:", error);
    }
  }
};

/**
 * Gửi thông báo đến danh sách người dùng
 * @param {Array} userIds - Danh sách ID người nhận
 * @param {Object} notificationData - Dữ liệu thông báo
 */
export const sendToUsers = async (userIds, notificationData) => {
  try {
    const users = await User.find({ _id: { $in: userIds } });
    const notifications = [];
    const fcmTokens = [];

    for (const user of users) {
      // Get FCM tokens from NotificationPreference
      const preferences = await NotificationPreference.findOne({ user: user._id });
      if (preferences && preferences.devices) {
        const activeTokens = preferences.devices
          .filter(device => device.isActive && device.fcmToken)
          .map(device => device.fcmToken);
        fcmTokens.push(...activeTokens);
      }

      notifications.push({
        ...notificationData,
        recipient: user._id,
        sender: notificationData.sender || null,
        isRead: false,
        data: notificationData.data || {},
      });
    }

    // Lưu thông báo vào database
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    // Gửi FCM
    await _sendFCMBatch(fcmTokens, notificationData);

    return notifications;
  } catch (error) {
    throw new Error(`Lỗi khi gửi thông báo đến danh sách người dùng: ${error.message}`);
  }
};

/**
 * Gửi thông báo đến tất cả người dùng (students)
 */
export const sendToAllUsers = async (notificationData) => {
  try {
    const users = await User.find({ role: "user" }).select("_id");
    const userIds = users.map((u) => u._id);
    return await sendToUsers(userIds, notificationData);
  } catch (error) {
    throw new Error(`Lỗi khi gửi thông báo đến tất cả người dùng: ${error.message}`);
  }
};

/**
 * Gửi thông báo đến tất cả nhân viên
 */
export const sendToAllEmployees = async (notificationData) => {
  try {
    const employees = await User.find({ role: "employee" }).select("_id");
    const employeeIds = employees.map((e) => e._id);
    return await sendToUsers(employeeIds, notificationData);
  } catch (error) {
    throw new Error(`Lỗi khi gửi thông báo đến tất cả nhân viên: ${error.message}`);
  }
};

/**
 * Gửi thông báo đến quản lý
 */
export const sendToManagers = async (notificationData) => {
  try {
    const managers = await User.find({ role: "manager" }).select("_id");
    const managerIds = managers.map((m) => m._id);
    return await sendToUsers(managerIds, notificationData);
  } catch (error) {
    throw new Error(`Lỗi khi gửi thông báo đến quản lý: ${error.message}`);
  }
};

/**
 * Gửi thông báo đến admin
 */
export const sendToAdmin = async (notificationData) => {
  try {
    const admins = await User.find({ role: "admin" }).select("_id");
    const adminIds = admins.map((a) => a._id);
    return await sendToUsers(adminIds, notificationData);
  } catch (error) {
    throw new Error(`Lỗi khi gửi thông báo đến admin: ${error.message}`);
  }
};

/**
 * Gửi thông báo đến một người dùng cụ thể
 */
export const sendToUser = async (userId, notificationData) => {
  return await sendToUsers([userId], notificationData);
};

/**
 * Gửi thông báo đến cả user và admin
 */
export const sendToBoth = async (userId, adminId, notificationData) => {
  try {
    const results = [];
    
    // Send to user
    if (userId) {
      const userResult = await sendToUser(userId, notificationData);
      results.push(...userResult);
    }
    
    // Send to admin
    if (adminId) {
      const adminResult = await sendToUser(adminId, notificationData);
      results.push(...adminResult);
    }
    
    return results;
  } catch (error) {
    throw new Error(`Lỗi khi gửi thông báo đến cả hai bên: ${error.message}`);
  }
};

/**
 * Lấy danh sách thông báo của một người dùng
 */
export const getUserNotifications = async (userId, options = { limit: 20, skip: 0, isRead: undefined }) => {
  try {
    const query = { recipient: userId };
    
    if (options.isRead !== undefined) {
      query.isRead = options.isRead;
    }

    return await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(options.skip)
      .limit(options.limit)
      .populate("recipient", "_id fullName avatar")
      .populate("sender", "_id fullName avatar role");
  } catch (error) {
    throw new Error(`Lỗi khi lấy thông báo của người dùng: ${error.message}`);
  }
};

/**
 * Đánh dấu thông báo đã đọc
 */
export const markAsRead = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      throw new Error("Không tìm thấy thông báo hoặc không có quyền truy cập");
    }

    return notification;
  } catch (error) {
    throw new Error(`Lỗi khi đánh dấu thông báo đã đọc: ${error.message}`);
  }
};

/**
 * Đánh dấu tất cả thông báo đã đọc
 */
export const markAllAsRead = async (userId) => {
  try {
    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true }
    );
    return {
      success: true,
      message: "Tất cả thông báo đã được đánh dấu là đã đọc.",
    };
  } catch (error) {
    console.error("Lỗi khi đánh dấu tất cả thông báo đã đọc:", error);
    throw new Error("Không thể đánh dấu tất cả thông báo là đã đọc.");
  }
};

/**
 * Lấy số lượng thông báo chưa đọc của người dùng
 */
export const getUnreadCount = async (userId) => {
  try {
    return await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });
  } catch (error) {
    throw new Error(`Lỗi khi lấy số lượng thông báo chưa đọc: ${error.message}`);
  }
};

/**
 * Cập nhật FCM token cho người dùng
 */
export const updateFCMToken = async (userId, fcmToken, deviceInfo = {}) => {
  try {
    let preferences = await NotificationPreference.findOne({ user: userId });
    
    if (!preferences) {
      // Create new preference if not exists
      preferences = new NotificationPreference({
        user: userId,
        devices: [{
          fcmToken,
          isActive: true,
          ...deviceInfo
        }]
      });
    } else {
      // Update or add device token
      const existingDeviceIndex = preferences.devices.findIndex(
        device => device.fcmToken === fcmToken
      );
      
      if (existingDeviceIndex >= 0) {
        // Update existing device
        preferences.devices[existingDeviceIndex].isActive = true;
        preferences.devices[existingDeviceIndex].lastSeen = new Date();
        Object.assign(preferences.devices[existingDeviceIndex], deviceInfo);
      } else {
        // Add new device
        preferences.devices.push({
          fcmToken,
          isActive: true,
          lastSeen: new Date(),
          ...deviceInfo
        });
      }
    }
    
    return await preferences.save();
  } catch (error) {
    throw new Error(`Lỗi khi cập nhật FCM token: ${error.message}`);
  }
};

/**
 * Xóa FCM token của người dùng
 */
export const removeFCMToken = async (userId, fcmToken) => {
  try {
    const preferences = await NotificationPreference.findOne({ user: userId });
    if (preferences) {
      preferences.devices = preferences.devices.filter(
        device => device.fcmToken !== fcmToken
      );
      await preferences.save();
    }
    return true;
  } catch (error) {
    throw new Error(`Lỗi khi xóa FCM token: ${error.message}`);
  }
};

// Default export for backward compatibility
const notificationService = {
  sendToUsers,
  sendToAllUsers,
  sendToAllEmployees,
  sendToManagers,
  sendToAdmin,
  sendToUser,
  sendToBoth,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  updateFCMToken,
  removeFCMToken,
  registrationNotifications
};

// Registration notification templates
export const registrationNotifications = {
  // New registration submitted
  newRegistration: async (registration) => {
    const student = await Student.findById(registration.student).populate('userId');
    
    // Notify admins
    const displayName = student.userId?.fullName || student.userId?.email || 'Sinh viên';
    await sendToAdmin({
      type: 'registration',
      title: 'Đơn đăng ký KTX mới',
      message: `Sinh viên ${displayName} (${student.studentId}) đã nộp đơn đăng ký ký túc xá`,
      data: {
        registrationId: registration._id.toString(),
        studentId: student._id.toString()
      }
    });
  },

  // Registration approved
  registrationApproved: async (registration) => {
    const student = await Student.findById(registration.student).populate('userId');
    
    await sendToUser(student.userId._id, {
      type: 'registration',
      title: 'Đơn đăng ký được duyệt',
      message: `Chúc mừng! Đơn đăng ký KTX của bạn đã được duyệt. Mã đơn: ${registration.registrationCode}`,
      data: {
        registrationId: registration._id.toString(),
        status: 'approved'
      }
    });
  },

  // Registration rejected
  registrationRejected: async (registration) => {
    const student = await Student.findById(registration.student).populate('userId');
    
    await sendToUser(student.userId._id, {
      type: 'registration',
      title: 'Đơn đăng ký bị từ chối',
      message: `Đơn đăng ký KTX của bạn đã bị từ chối. Lý do: ${registration.reviewInfo?.rejectionReason || 'Không có lý do cụ thể'}`,
      data: {
        registrationId: registration._id.toString(),
        status: 'rejected'
      }
    });
  },

  // Payment reminder
  paymentReminder: async (registration) => {
    const student = await Student.findById(registration.student).populate('userId');
    
    await sendToUser(student.userId._id, {
      type: 'payment',
      title: 'Nhắc nhở thanh toán',
      message: `Vui lòng thanh toán phí đăng ký KTX trước ngày ${registration.paymentInfo?.paymentDeadline?.toLocaleDateString() || 'sớm nhất'}`,
      data: {
        registrationId: registration._id.toString(),
        amount: registration.paymentInfo?.totalAmount || 0,
        deadline: registration.paymentInfo?.paymentDeadline
      }
    });
  },

  // Check-in scheduled
  checkInScheduled: async (registration) => {
    const student = await Student.findById(registration.student).populate('userId');
    
    await sendToUser(student.userId._id, {
      type: 'checkin',
      title: 'Lịch nhận phòng',
      message: `Lịch nhận phòng của bạn: ${registration.checkInInfo?.scheduledCheckInDate?.toLocaleDateString() || 'Đang cập nhật'}`,
      data: {
        registrationId: registration._id.toString(),
        checkInDate: registration.checkInInfo?.scheduledCheckInDate
      }
    });
  },

  // Document verified
  documentVerified: async (registration, document) => {
    const student = await Student.findById(registration.student).populate('userId');
    
    await sendToUser(student.userId._id, {
      type: 'document',
      title: 'Tài liệu đã được xác minh',
      message: `Tài liệu ${document.type} của bạn đã được xác minh`,
      data: {
        registrationId: registration._id.toString(),
        documentType: document.type
      }
    });
  },

  // Document rejected
  documentRejected: async (registration, document) => {
    const student = await Student.findById(registration.student).populate('userId');
    
    await sendToUser(student.userId._id, {
      type: 'document',
      title: 'Tài liệu bị từ chối',
      message: `Tài liệu ${document.type} của bạn đã bị từ chối. Lý do: ${document.rejectionReason || 'Không có lý do cụ thể'}`,
      data: {
        registrationId: registration._id.toString(),
        documentType: document.type
      }
    });
  }
};

export default notificationService;

