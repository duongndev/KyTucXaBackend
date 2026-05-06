import MaintenanceRequest from "../../models/maintenance/maintenanceRequest.model.js";
import Student from "../../models/user/student.model.js";
import Room from "../../models/building/room.model.js";
import User from "../../models/user/user.model.js";
import Contract from "../../models/contract/contract.model.js";
import { generateMaintenanceCode } from "../../utils/generators.js";
import * as notificationService from "../../services/notification.service.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  notFoundResponse,
  createdResponse,
  forbiddenResponse
} from "../../utils/response.js";
import expressAsyncHandler from "express-async-handler";
import mongoose from "mongoose";

// Categories with descriptions
const CATEGORY_LABELS = {
  electrical: "Điện (công tắc, ổ cắm, đèn, quạt)",
  plumbing: "Nước (vòi nước, bồn cầu, thông tắc)",
  furniture: "Nội thất (giường, tủ, bàn ghế)",
  door_window: "Cửa và cửa sổ (khóa, bản lề, kính)",
  ac: "Máy lạnh",
  appliance: "Thiết bị (tủ lạnh, máy giặt)",
  network: "Mạng internet, wifi",
  security: "An ninh (camera, khóa cửa)",
  cleaning: "Vệ sinh (dọn dẹp, khử mùi)",
  pest: "Côn trùng (kiến, gián, muỗi)",
  other: "Khác"
};

const PRIORITY_LABELS = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp"
};

const STATUS_LABELS = {
  pending: "Chờ xử lý",
  reviewing: "Đang xem xét",
  assigned: "Đã phân công",
  in_progress: "Đang sửa chữa",
  paused: "Tạm dừng",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  rejected: "Từ chối"
};

// ==================== STUDENT APIs ====================

/**
 * @desc    Tạo yêu cầu sửa chữa mới (Student)
 * @route   POST /api/maintenance
 * @access  Private (Student)
 */
export const createMaintenanceRequest = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { category, priority, title, description, images, isUrgent } = req.body;

  // Validate required fields
  if (!category || !title || !description) {
    return badRequestResponse(res, "Vui lòng điền đầy đủ loại hỏng hóc, tiêu đề và mô tả");
  }

  // Get student profile
  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Không tìm thấy hồ sơ sinh viên");
  }

  // Check if student has active contract and room
  if (!student.currentRoom || !student.currentContract) {
    return forbiddenResponse(res, "Bạn cần có hợp đồng và phòng ở hiện tại để báo hỏng");
  }

  // Get room details
  const room = await Room.findById(student.currentRoom)
    .populate("buildingId", "buildingCode buildingName");

  if (!room) {
    return notFoundResponse(res, "Không tìm thấy thông tin phòng");
  }

  // Check for duplicate recent requests (same category, within 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentRequest = await MaintenanceRequest.findOne({
    studentId: student._id,
    roomId: room._id,
    category,
    createdAt: { $gte: oneDayAgo },
    status: { $nin: ["completed", "cancelled", "rejected"] }
  });

  if (recentRequest) {
    return badRequestResponse(res,
      `Bạn đã có yêu cầu ${CATEGORY_LABELS[category]} đang chờ xử lý trong 24 giờ qua. Vui lòng đợi hoặc cập nhật yêu cầu cũ.`,
      { existingRequestId: recentRequest._id }
    );
  }

  // Generate request code
  const requestCode = await generateMaintenanceCode();

  // Create request
  const request = await MaintenanceRequest.create({
    requestCode,
    studentId: student._id,
    roomId: room._id,
    buildingId: room.buildingId._id,
    category,
    priority: priority || "medium",
    title,
    description,
    images: images || [],
    isUrgent: isUrgent || false,
    status: "pending",
    statusHistory: [{
      status: "pending",
      changedBy: userId,
      changedAt: new Date(),
      note: "Yêu cầu được tạo"
    }]
  });

  // Populate for response
  const populatedRequest = await MaintenanceRequest.findById(request._id)
    .populate("roomId", "roomCode roomNumber floor")
    .populate("buildingId", "buildingCode buildingName");

  // Send notification to all admins
  try {
    await notificationService.sendToAdmin({
      title: isUrgent ? "🚨 Báo hỏng KHẨN CẤP" : "📢 Báo hỏng mới",
      content: `${CATEGORY_LABELS[category]} - Phòng ${room.roomCode}: ${title}`,
      type: "maintenance_new",
      category: "maintenance",
      priority: isUrgent ? "high" : "normal",
      data: {
        requestId: request._id.toString(),
        requestCode: requestCode,
        roomCode: room.roomCode,
        category: category,
        isUrgent: isUrgent || false
      }
    });
  } catch (notifyError) {
    console.error("[Maintenance] Failed to send admin notification:", notifyError.message);
  }

  createdResponse(res, "Yêu cầu sửa chữa đã được tạo thành công", {
    request: populatedRequest,
    categoryLabel: CATEGORY_LABELS[category],
    priorityLabel: PRIORITY_LABELS[priority || "medium"]
  });
});

/**
 * @desc    Lấy danh sách yêu cầu của sinh viên hiện tại
 * @route   GET /api/maintenance/my-requests
 * @access  Private (Student)
 */
export const getMyMaintenanceRequests = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status, page = 1, limit = 10 } = req.query;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Không tìm thấy hồ sơ sinh viên");
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const filter = { studentId: student._id };
  if (status) {
    filter.status = status;
  }

  const [requests, total] = await Promise.all([
    MaintenanceRequest.find(filter)
      .populate("roomId", "roomCode roomNumber floor")
      .populate("buildingId", "buildingCode buildingName")
      .populate("assignment.assignedTo", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    MaintenanceRequest.countDocuments(filter)
  ]);

  successResponse(res, "Danh sách yêu cầu sửa chữa", {
    requests: requests.map(r => ({
      ...r.toObject(),
      categoryLabel: CATEGORY_LABELS[r.category],
      statusLabel: STATUS_LABELS[r.status],
      priorityLabel: PRIORITY_LABELS[r.priority]
    })),
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum
    }
  });
});

/**
 * @desc    Lấy chi tiết yêu cầu sửa chữa (Student - chỉ của mình)
 * @route   GET /api/maintenance/:id
 * @access  Private (Student)
 */
export const getMyRequestDetail = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Không tìm thấy hồ sơ sinh viên");
  }

  const request = await MaintenanceRequest.findOne({
    _id: id,
    studentId: student._id
  })
    .populate("roomId", "roomCode roomNumber floor")
    .populate("buildingId", "buildingCode buildingName")
    .populate("assignment.assignedTo", "fullName email phoneNumber")
    .populate("statusHistory.changedBy", "fullName role")
    .populate("relatedRequestId", "requestCode status completedDate");

  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu sửa chữa");
  }

  // Mark as viewed
  if (!request.viewedByStudent) {
    request.viewedByStudent = true;
    await request.save();
  }

  successResponse(res, "Chi tiết yêu cầu sửa chữa", {
    request: {
      ...request.toObject(),
      categoryLabel: CATEGORY_LABELS[request.category],
      statusLabel: STATUS_LABELS[request.status],
      priorityLabel: PRIORITY_LABELS[request.priority]
    }
  });
});

/**
 * @desc    Cập nhật yêu cầu (Student - chỉ khi chưa được xử lý)
 * @route   PUT /api/maintenance/:id
 * @access  Private (Student)
 */
export const updateMyRequest = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { title, description, images, priority } = req.body;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Không tìm thấy hồ sơ sinh viên");
  }

  const request = await MaintenanceRequest.findOne({
    _id: id,
    studentId: student._id
  });

  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu sửa chữa");
  }

  // Only allow update if status is pending or reviewing
  if (!["pending", "reviewing"].includes(request.status)) {
    return forbiddenResponse(res, "Không thể cập nhật yêu cầu đang được xử lý hoặc đã hoàn thành");
  }

  if (title) request.title = title;
  if (description) request.description = description;
  if (images) request.images = images;
  if (priority) request.priority = priority;

  request.statusHistory.push({
    status: request.status,
    changedBy: userId,
    changedAt: new Date(),
    note: "Sinh viên cập nhật thông tin"
  });

  await request.save();

  successResponse(res, "Cập nhật yêu cầu thành công", { request });
});

/**
 * @desc    Hủy yêu cầu (Student)
 * @route   DELETE /api/maintenance/:id
 * @access  Private (Student)
 */
export const cancelMyRequest = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { reason } = req.body;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Không tìm thấy hồ sơ sinh viên");
  }

  const request = await MaintenanceRequest.findOne({
    _id: id,
    studentId: student._id
  });

  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu sửa chữa");
  }

  // Cannot cancel if already in progress or completed
  if (["in_progress", "completed", "cancelled", "rejected"].includes(request.status)) {
    return forbiddenResponse(res, "Không thể hủy yêu cầu đang sửa chữa hoặc đã hoàn thành");
  }

  await request.updateStatus("cancelled", userId, reason || "Sinh viên hủy yêu cầu");

  successResponse(res, "Đã hủy yêu cầu sửa chữa");
});

/**
 * @desc    Đánh giá chất lượng sửa chữa
 * @route   POST /api/maintenance/:id/rate
 * @access  Private (Student)
 */
export const rateMaintenanceRequest = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { score, comment } = req.body;

  if (!score || score < 1 || score > 5) {
    return badRequestResponse(res, "Vui lòng chọn điểm đánh giá từ 1-5");
  }

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Không tìm thấy hồ sơ sinh viên");
  }

  const request = await MaintenanceRequest.findOne({
    _id: id,
    studentId: student._id,
    status: "completed"
  });

  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu đã hoàn thành");
  }

  if (request.rating && request.rating.score) {
    return badRequestResponse(res, "Bạn đã đánh giá yêu cầu này rồi");
  }

  await request.addRating(score, comment);

  successResponse(res, "Cảm ơn bạn đã đánh giá!", {
    rating: { score, comment, ratedAt: new Date() }
  });
});

// ==================== ADMIN APIs ====================

/**
 * @desc    Lấy tất cả yêu cầu sửa chữa (Admin)
 * @route   GET /api/maintenance/admin/all
 * @access  Private (Admin)
 */
export const getAllMaintenanceRequests = expressAsyncHandler(async (req, res) => {
  const {
    status,
    category,
    priority,
    buildingId,
    roomId,
    isUrgent,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    order = "desc"
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (buildingId) filter.buildingId = buildingId;
  if (roomId) filter.roomId = roomId;
  if (isUrgent !== undefined) filter.isUrgent = isUrgent === "true";

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sortOrder = order === "desc" ? -1 : 1;

  const [requests, total] = await Promise.all([
    MaintenanceRequest.find(filter)
      .populate("studentId", "studentId")
      .populate("studentId.userId", "fullName email phoneNumber")
      .populate("roomId", "roomCode roomNumber floor")
      .populate("buildingId", "buildingCode buildingName")
      .populate("assignment.assignedTo", "fullName email")
      .sort({ isUrgent: -1, [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum),
    MaintenanceRequest.countDocuments(filter)
  ]);

  successResponse(res, "Danh sách tất cả yêu cầu sửa chữa", {
    requests: requests.map(r => ({
      ...r.toObject(),
      categoryLabel: CATEGORY_LABELS[r.category],
      statusLabel: STATUS_LABELS[r.status],
      priorityLabel: PRIORITY_LABELS[r.priority]
    })),
    summary: {
      total,
      pending: requests.filter(r => r.status === "pending").length,
      inProgress: requests.filter(r => ["assigned", "in_progress"].includes(r.status)).length,
      urgent: requests.filter(r => r.isUrgent).length
    },
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum
    }
  });
});

/**
 * @desc    Lấy chi tiết yêu cầu (Admin)
 * @route   GET /api/maintenance/admin/:id
 * @access  Private (Admin)
 */
export const getRequestDetailAdmin = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const request = await MaintenanceRequest.findById(id)
    .populate("studentId", "studentId currentRoom")
    .populate("studentId.userId", "fullName email phoneNumber")
    .populate("roomId", "roomCode roomNumber floor buildingId")
    .populate("buildingId", "buildingCode buildingName address")
    .populate("assignment.assignedTo", "fullName email phoneNumber")
    .populate("assignment.assignedBy", "fullName")
    .populate("statusHistory.changedBy", "fullName role")
    .populate("relatedRequestId", "requestCode status completedDate completionNote");

  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu sửa chữa");
  }

  // Mark as viewed by admin
  if (!request.viewedByAdminAt) {
    request.viewedByAdminAt = new Date();
    await request.save();
  }

  successResponse(res, "Chi tiết yêu cầu sửa chữa", {
    request: {
      ...request.toObject(),
      categoryLabel: CATEGORY_LABELS[request.category],
      statusLabel: STATUS_LABELS[request.status],
      priorityLabel: PRIORITY_LABELS[request.priority]
    }
  });
});

/**
 * @desc    Cập nhật trạng thái yêu cầu (Admin)
 * @route   PUT /api/maintenance/admin/:id/status
 * @access  Private (Admin)
 */
export const updateRequestStatus = expressAsyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { id } = req.params;
  const { status, note } = req.body;

  if (!status) {
    return badRequestResponse(res, "Vui lòng cung cấp trạng thái mới");
  }

  const validTransitions = {
    pending: ["reviewing", "assigned", "rejected"],
    reviewing: ["assigned", "pending", "rejected"],
    assigned: ["in_progress", "paused", "pending"],
    in_progress: ["paused", "completed", "pending"],
    paused: ["in_progress", "pending"],
    completed: [],
    cancelled: [],
    rejected: ["pending"]
  };

  const request = await MaintenanceRequest.findById(id);
  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu sửa chữa");
  }

  const allowedTransitions = validTransitions[request.status] || [];
  if (!allowedTransitions.includes(status) && request.status !== status) {
    return badRequestResponse(
      res,
      `Không thể chuyển từ ${STATUS_LABELS[request.status]} sang ${STATUS_LABELS[status]}`
    );
  }

  await request.updateStatus(status, adminId, note);

  // Send notification to student about status change
  try {
    const student = await Student.findById(request.studentId).populate("userId", "_id");
    if (student && student.userId) {
      let notificationTitle = "📋 Cập nhật sửa chữa";
      let notificationContent = `Yêu cầu ${request.requestCode}: ${STATUS_LABELS[status]}`;

      if (status === "rejected") {
        notificationTitle = "❌ Yêu cầu bị từ chối";
        notificationContent = `Yêu cầu ${request.requestCode} đã bị từ chối. Lý do: ${note || "Không có lý do"}`;
      } else if (status === "assigned") {
        notificationTitle = "👷 Đã phân công";
        notificationContent = `Yêu cầu ${request.requestCode} đã được phân công kỹ thuật viên`;
      } else if (status === "in_progress") {
        notificationTitle = "🔧 Đang sửa chữa";
        notificationContent = `Yêu cầu ${request.requestCode} đang được thực hiện`;
      } else if (status === "completed") {
        notificationTitle = "✅ Hoàn thành";
        notificationContent = `Yêu cầu ${request.requestCode} đã sửa xong. Vui lòng đánh giá!`;
      }

      await notificationService.sendToUser(student.userId._id, {
        title: notificationTitle,
        content: notificationContent,
        type: "maintenance_status",
        category: "maintenance",
        priority: status === "rejected" ? "high" : "normal",
        data: {
          requestId: request._id.toString(),
          requestCode: request.requestCode,
          status: status,
          note: note || ""
        }
      });
    }
  } catch (notifyError) {
    console.error("[Maintenance] Failed to send student notification:", notifyError.message);
  }

  successResponse(res, "Cập nhật trạng thái thành công", {
    request: {
      ...request.toObject(),
      statusLabel: STATUS_LABELS[request.status]
    }
  });
});

/**
 * @desc    Phân công yêu cầu cho technician (Admin)
 * @route   PUT /api/maintenance/admin/:id/assign
 * @access  Private (Admin)
 */
export const assignRequest = expressAsyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { id } = req.params;
  const { technicianId, note, estimatedCompletion } = req.body;

  if (!technicianId) {
    return badRequestResponse(res, "Vui lòng chọn người phụ trách");
  }

  // Verify technician exists and is admin/staff
  const technician = await User.findById(technicianId);
  if (!technician || !["admin", "staff"].includes(technician.role)) {
    return badRequestResponse(res, "Người phụ trách không hợp lệ");
  }

  const request = await MaintenanceRequest.findById(id);
  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu sửa chữa");
  }

  if (!["pending", "reviewing", "assigned", "paused"].includes(request.status)) {
    return badRequestResponse(res, "Không thể phân công yêu cầu ở trạng thái này");
  }

  const estimatedDate = estimatedCompletion ? new Date(estimatedCompletion) : null;

  await request.assignTo(technicianId, adminId, note, estimatedDate);

  const populatedRequest = await MaintenanceRequest.findById(id)
    .populate("assignment.assignedTo", "fullName email phoneNumber")
    .populate("assignment.assignedBy", "fullName");

  // Send notification to technician
  try {
    await notificationService.sendToUser(technicianId, {
      title: "🔧 Công việc mới",
      content: `Bạn được phân công sửa chữa ${request.requestCode} - Phòng ${request.roomId}`,
      type: "maintenance_assigned",
      category: "maintenance",
      priority: request.priority === "urgent" ? "high" : "normal",
      data: {
        requestId: request._id.toString(),
        requestCode: request.requestCode,
        estimatedCompletion: estimatedDate ? estimatedDate.toISOString() : null
      }
    });
  } catch (notifyError) {
    console.error("[Maintenance] Failed to send technician notification:", notifyError.message);
  }

  // Send notification to student
  try {
    const student = await Student.findById(request.studentId).populate("userId", "_id");
    if (student && student.userId) {
      await notificationService.sendToUser(student.userId._id, {
        title: "👷 Đã phân công kỹ thuật viên",
        content: `Yêu cầu ${request.requestCode} đã được phân công cho ${populatedRequest.assignment.assignedTo.fullName}`,
        type: "maintenance_assigned",
        category: "maintenance",
        priority: "normal",
        data: {
          requestId: request._id.toString(),
          requestCode: request.requestCode,
          technicianName: populatedRequest.assignment.assignedTo.fullName,
          estimatedCompletion: estimatedDate ? estimatedDate.toISOString() : null
        }
      });
    }
  } catch (notifyError) {
    console.error("[Maintenance] Failed to send student notification:", notifyError.message);
  }

  successResponse(res, "Phân công yêu cầu thành công", {
    request: populatedRequest
  });
});

/**
 * @desc    Cập nhật thông tin hoàn thành (Admin/Technician)
 * @route   PUT /api/maintenance/admin/:id/complete
 * @access  Private (Admin/Staff)
 */
export const completeRequest = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { completionNote, completionImages, costs, materials } = req.body;

  const request = await MaintenanceRequest.findById(id);
  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu sửa chữa");
  }

  if (!["assigned", "in_progress", "paused"].includes(request.status)) {
    return badRequestResponse(res, "Yêu cầu chưa được phân công hoặc đang ở trạng thái không hợp lệ");
  }

  // Add completion details
  await request.addCompletionDetails(completionNote, completionImages, costs, materials);

  // Update status to completed
  await request.updateStatus("completed", userId, "Hoàn thành sửa chữa");

  // Send notification to student
  try {
    const student = await Student.findById(request.studentId).populate("userId", "_id");
    if (student && student.userId) {
      await notificationService.sendToUser(student.userId._id, {
        title: "✅ Sửa chữa hoàn thành",
        content: `Yêu cầu ${request.requestCode} đã được sửa xong. Vui lòng kiểm tra và đánh giá chất lượng!`,
        type: "maintenance_completed",
        category: "maintenance",
        priority: "normal",
        data: {
          requestId: request._id.toString(),
          requestCode: request.requestCode,
          completedDate: new Date().toISOString()
        }
      });
    }
  } catch (notifyError) {
    console.error("[Maintenance] Failed to send completion notification:", notifyError.message);
  }

  successResponse(res, "Đánh dấu hoàn thành yêu cầu", { request });
});

/**
 * @desc    Thêm lịch hẹn sửa chữa
 * @route   PUT /api/maintenance/admin/:id/schedule
 * @access  Private (Admin)
 */
export const scheduleRequest = expressAsyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { id } = req.params;
  const { scheduledDate, note } = req.body;

  if (!scheduledDate) {
    return badRequestResponse(res, "Vui lòng chọn ngày hẹn");
  }

  const request = await MaintenanceRequest.findById(id);
  if (!request) {
    return notFoundResponse(res, "Không tìm thấy yêu cầu sửa chữa");
  }

  request.scheduledDate = new Date(scheduledDate);
  request.statusHistory.push({
    status: request.status,
    changedBy: adminId,
    changedAt: new Date(),
    note: note || `Hẹn sửa chữa: ${new Date(scheduledDate).toLocaleDateString("vi-VN")}`
  });

  await request.save();

  // Send notification to student about scheduled date
  try {
    const student = await Student.findById(request.studentId).populate("userId", "_id fullName");
    if (student && student.userId) {
      await notificationService.sendToUser(student.userId._id, {
        title: "📅 Lịch hẹn sửa chữa",
        content: `Yêu cầu ${request.requestCode} sẽ được sửa vào ${new Date(scheduledDate).toLocaleDateString("vi-VN")}`,
        type: "maintenance_scheduled",
        category: "maintenance",
        priority: "normal",
        data: {
          requestId: request._id.toString(),
          requestCode: request.requestCode,
          scheduledDate: scheduledDate
        }
      });
    }
  } catch (notifyError) {
    console.error("[Maintenance] Failed to send schedule notification:", notifyError.message);
  }

  successResponse(res, "Đã lên lịch sửa chữa", {
    scheduledDate: request.scheduledDate
  });
});

/**
 * @desc    Lấy yêu cầu được phân công cho technician
 * @route   GET /api/maintenance/admin/my-assignments
 * @access  Private (Admin/Staff)
 */
export const getMyAssignments = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { status } = req.query;

  let query = { "assignment.assignedTo": userId };
  if (status) {
    query.status = status;
  } else {
    query.status = { $in: ["assigned", "in_progress", "paused"] };
  }

  const requests = await MaintenanceRequest.find(query)
    .populate("studentId", "studentId")
    .populate("studentId.userId", "fullName email phoneNumber")
    .populate("roomId", "roomCode roomNumber floor")
    .populate("buildingId", "buildingCode buildingName address")
    .sort({ scheduledDate: 1, priority: -1 });

  successResponse(res, "Danh sách công việc được phân công", {
    requests: requests.map(r => ({
      ...r.toObject(),
      categoryLabel: CATEGORY_LABELS[r.category],
      statusLabel: STATUS_LABELS[r.status],
      priorityLabel: PRIORITY_LABELS[r.priority]
    })),
    total: requests.length
  });
});

/**
 * @desc    Thống kê báo hỏng (Admin)
 * @route   GET /api/maintenance/admin/statistics
 * @access  Private (Admin)
 */
export const getMaintenanceStatistics = expressAsyncHandler(async (req, res) => {
  const { buildingId, startDate, endDate } = req.query;

  const stats = await MaintenanceRequest.getStatistics({
    buildingId,
    startDate,
    endDate
  });

  // Get additional stats
  const categoryStats = await MaintenanceRequest.aggregate([
    {
      $match: buildingId
        ? { buildingId: new mongoose.Types.ObjectId(buildingId) }
        : {}
    },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
        },
        avgCost: { $avg: "$cost.totalCost" }
      }
    }
  ]);

  const monthlyStats = await MaintenanceRequest.aggregate([
    {
      $match: buildingId
        ? { buildingId: new mongoose.Types.ObjectId(buildingId) }
        : {}
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        count: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
        }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } },
    { $limit: 12 }
  ]);

  successResponse(res, "Thống kê báo hỏng & sửa chữa", {
    overview: stats,
    byCategory: categoryStats.map(c => ({
      category: c._id,
      categoryLabel: CATEGORY_LABELS[c._id],
      count: c.count,
      completed: c.completed,
      completionRate: c.count > 0 ? ((c.completed / c.count) * 100).toFixed(1) : 0,
      avgCost: c.avgCost || 0
    })),
    monthlyTrend: monthlyStats.map(m => ({
      month: `${m._id.month}/${m._id.year}`,
      total: m.count,
      completed: m.completed
    }))
  });
});

/**
 * @desc    Lấy danh sách pending chưa xem (Admin)
 * @route   GET /api/maintenance/admin/pending-unviewed
 * @access  Private (Admin)
 */
export const getPendingUnviewed = expressAsyncHandler(async (req, res) => {
  const requests = await MaintenanceRequest.find({
    status: { $in: ["pending", "reviewing"] },
    viewedByAdminAt: null
  })
    .populate("studentId", "studentId")
    .populate("studentId.userId", "fullName email")
    .populate("roomId", "roomCode roomNumber")
    .populate("buildingId", "buildingCode")
    .sort({ isUrgent: -1, priority: -1, createdAt: -1 });

  successResponse(res, "Yêu cầu chưa xem", {
    count: requests.length,
    requests: requests.map(r => ({
      ...r.toObject(),
      categoryLabel: CATEGORY_LABELS[r.category],
      priorityLabel: PRIORITY_LABELS[r.priority]
    }))
  });
});
