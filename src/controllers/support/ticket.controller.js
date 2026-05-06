import { SupportTicket, ChatRoom } from '../../models/support/index.js';
import Student from '../../models/user/student.model.js';
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse,
  badRequestResponse
} from '../../utils/response.js';
import { buildPaginationMeta } from '../../helpers/pagination.js';
import * as notificationService from '../../services/notification.service.js';

const autoAssignRules = [
  { keywords: ['hóa đơn', 'thanh toán', 'tiền', 'phí', 'billing', 'payment'], category: 'billing' },
  { keywords: ['sửa chữa', 'hỏng', 'vỡ', 'maintenance', 'repair', 'broken'], category: 'maintenance' },
  { keywords: ['mạng', 'wifi', 'internet', 'network', 'không kết nối'], category: 'internet' },
  { keywords: ['ồn ào', 'khiếu nại', 'noise', 'complaint', 'loud'], category: 'noise_complaint' },
  { keywords: ['an ninh', 'bảo vệ', 'trộm', 'security', 'theft', 'safe'], category: 'security' },
  { keywords: ['phòng', 'room', 'chuyển phòng', 'move'], category: 'room_issue' }
];

const detectCategory = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();
  for (const rule of autoAssignRules) {
    if (rule.keywords.some(kw => text.includes(kw.toLowerCase()))) {
      return rule.category;
    }
  }
  return 'other';
};

const getPriorityByCategory = (category) => {
  const priorities = {
    security: 'high',
    noise_complaint: 'medium',
    maintenance: 'medium',
    billing: 'medium',
    room_issue: 'low',
    internet: 'medium',
    other: 'low'
  };
  return priorities[category] || 'medium';
};

export const createTicket = async (req, res) => {
  try {
    const { title, description, category, priority, attachments } = req.body;
    const userId = req.user._id;

    const student = await Student.findOne({ userId });
    if (!student) {
      return notFoundResponse(res, 'Không tìm thấy thông tin sinh viên');
    }

    const detectedCategory = category || detectCategory(title, description);
    const assignedPriority = priority || getPriorityByCategory(detectedCategory);

    const ticket = await SupportTicket.create({
      title,
      description,
      category: detectedCategory,
      priority: assignedPriority,
      createdBy: userId,
      studentId: student._id,
      relatedRoomId: student.currentRoom,
      attachments: attachments || [],
      status: 'open',
      history: [{
        action: 'created',
        performedBy: userId,
        details: { category: detectedCategory, priority: assignedPriority }
      }],
      isAutoAssigned: !category,
      autoAssignmentReason: !category ? `Auto-detected: ${detectedCategory}` : null
    });

    const chatRoom = await ChatRoom.create({
      roomType: 'ticket',
      title: `Ticket: ${title}`,
      participants: [{
        userId,
        role: 'student',
        joinedAt: new Date()
      }],
      relatedTicketId: ticket._id,
      status: 'active'
    });

    const populatedTicket = await SupportTicket.findById(ticket._id)
      .populate('createdBy', 'fullName email')
      .populate('studentId', 'studentId university')
      .populate('relatedRoomId', 'roomCode roomNumber');

    // Notify admins about new ticket
    notificationService.sendToAdmin({
      type: 'new_ticket',
      title: 'Ticket hỗ trợ mới',
      message: `${student.studentId}: ${title.substring(0, 50)}`,
      data: {
        ticketId: ticket._id.toString(),
        ticketCode: ticket.ticketCode,
        category: detectedCategory,
        priority: assignedPriority
      }
    }).catch(err => console.error('Error sending ticket notification:', err));

    return createdResponse(res, 'Tạo ticket thành công', {
      ticket: populatedTicket,
      chatRoomId: chatRoom._id
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getMyTickets = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { createdBy: userId };
    if (status) query.status = status;

    const total = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .populate('assignedTo', 'fullName email')
      .populate('relatedRoomId', 'roomCode roomNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return successResponse(res, 'Lấy danh sách ticket thành công', {
      tickets,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const query = { _id: id };
    if (userRole === 'student') {
      query.createdBy = userId;
    }

    const ticket = await SupportTicket.findOne(query)
      .populate('createdBy', 'fullName email phoneNumber')
      .populate('studentId', 'studentId university major className')
      .populate('assignedTo', 'fullName email')
      .populate('relatedRoomId', 'roomCode roomNumber buildingId')
      .populate('relatedContractId', 'contractCode startDate endDate')
      .populate('history.performedBy', 'fullName role');

    if (!ticket) {
      return notFoundResponse(res, 'Ticket không tồn tại');
    }

    const chatRoom = await ChatRoom.findOne({ relatedTicketId: id });

    return successResponse(res, 'Lấy thông tin ticket thành công', {
      ticket,
      chatRoom
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, priority } = req.body;
    const userId = req.user._id;

    const ticket = await SupportTicket.findOne({ _id: id, createdBy: userId });
    if (!ticket) {
      return notFoundResponse(res, 'Ticket không tồn tại');
    }

    if (ticket.status === 'closed') {
      return badRequestResponse(res, 'Không thể cập nhật ticket đã đóng');
    }

    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (category) updates.category = category;
    if (priority) updates.priority = priority;

    const updatedTicket = await SupportTicket.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );

    return successResponse(res, 'Cập nhật ticket thành công', updatedTicket);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const adminGetAllTickets = async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      assignedTo,
      unassigned,
      overdue,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (unassigned === 'true') query.assignedTo = null;
    if (overdue === 'true') {
      query.dueDate = { $lt: new Date() };
      query.status = { $nin: ['resolved', 'closed'] };
    }

    const total = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .populate('createdBy', 'fullName email')
      .populate('studentId', 'studentId university')
      .populate('assignedTo', 'fullName email')
      .populate('relatedRoomId', 'roomCode roomNumber')
      .sort({ priority: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return successResponse(res, 'Lấy danh sách ticket thành công', {
      tickets,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const assignTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;
    const userId = req.user._id;

    const ticket = await SupportTicket.findByIdAndUpdate(
      id,
      {
        assignedTo: adminId,
        assignedAt: new Date(),
        status: 'in_progress',
        $push: {
          history: {
            action: 'assigned',
            performedBy: userId,
            details: { assignedTo: adminId }
          }
        }
      },
      { new: true }
    )
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email');

    if (!ticket) {
      return notFoundResponse(res, 'Ticket không tồn tại');
    }

    await ChatRoom.findOneAndUpdate(
      { relatedTicketId: id },
      {
        assignedAdminId: adminId,
        $addToSet: {
          participants: {
            userId: adminId,
            role: 'admin',
            joinedAt: new Date()
          }
        }
      }
    );

    // Notify assigned admin
    notificationService.sendToUsers([adminId], {
      type: 'ticket_assigned',
      title: 'Ticket được phân công cho bạn',
      message: `${ticket.title.substring(0, 50)}`,
      data: {
        ticketId: ticket._id.toString(),
        ticketCode: ticket.ticketCode,
        category: ticket.category
      }
    }).catch(err => console.error('Error sending assign notification:', err));

    return successResponse(res, 'Phân công ticket thành công', ticket);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const userId = req.user._id;

    const updates = {
      status,
      $push: {
        history: {
          action: 'status_changed',
          performedBy: userId,
          details: { newStatus: status, note }
        }
      }
    };

    if (status === 'resolved') {
      updates.resolvedAt = new Date();
    } else if (status === 'closed') {
      updates.closedAt = new Date();
    } else if (status === 'in_progress' && !updates.firstResponseAt) {
      const ticket = await SupportTicket.findById(id);
      if (!ticket.firstResponseAt) {
        updates.firstResponseAt = new Date();
      }
    }

    const ticket = await SupportTicket.findByIdAndUpdate(id, updates, { new: true })
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email');

    if (!ticket) {
      return notFoundResponse(res, 'Ticket không tồn tại');
    }

    // Notify ticket creator about status change
    const statusMessages = {
      'in_progress': 'Ticket đang được xử lý',
      'resolved': 'Ticket đã được giải quyết',
      'closed': 'Ticket đã đóng'
    };

    if (statusMessages[status] && ticket.createdBy) {
      notificationService.sendToUsers([ticket.createdBy._id], {
        type: 'ticket_status_changed',
        title: statusMessages[status],
        message: `${ticket.title.substring(0, 50)}`,
        data: {
          ticketId: ticket._id.toString(),
          ticketCode: ticket.ticketCode,
          newStatus: status,
          note: note || ''
        }
      }).catch(err => console.error('Error sending status notification:', err));
    }

    return successResponse(res, 'Cập nhật trạng thái thành công', ticket);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const addTicketComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user._id;

    const ticket = await SupportTicket.findByIdAndUpdate(
      id,
      {
        $push: {
          history: {
            action: 'commented',
            performedBy: userId,
            details: { comment }
          }
        }
      },
      { new: true }
    );

    if (!ticket) {
      return notFoundResponse(res, 'Ticket không tồn tại');
    }

    return successResponse(res, 'Thêm bình luận thành công', ticket);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const rateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    const ticket = await SupportTicket.findOne({ _id: id, createdBy: userId });
    if (!ticket) {
      return notFoundResponse(res, 'Ticket không tồn tại');
    }

    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      return badRequestResponse(res, 'Chỉ có thể đánh giá ticket đã giải quyết');
    }

    const updatedTicket = await SupportTicket.findByIdAndUpdate(
      id,
      {
        satisfactionRating: rating,
        satisfactionComment: comment
      },
      { new: true }
    );

    return successResponse(res, 'Đánh giá ticket thành công', updatedTicket);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getTicketStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const query = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const stats = await Promise.all([
      SupportTicket.countDocuments({ ...query, status: 'open' }),
      SupportTicket.countDocuments({ ...query, status: 'in_progress' }),
      SupportTicket.countDocuments({ ...query, status: 'resolved' }),
      SupportTicket.countDocuments({ ...query, status: 'closed' }),
      SupportTicket.countDocuments({ ...query })
    ]);

    const categoryStats = await SupportTicket.aggregate([
      { $match: query },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const priorityStats = await SupportTicket.aggregate([
      { $match: query },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    const avgSatisfaction = await SupportTicket.aggregate([
      { $match: { satisfactionRating: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$satisfactionRating' } } }
    ]);

    return successResponse(res, 'Lấy thống kê thành công', {
      status: {
        open: stats[0],
        in_progress: stats[1],
        resolved: stats[2],
        closed: stats[3],
        total: stats[4]
      },
      byCategory: categoryStats,
      byPriority: priorityStats,
      averageSatisfaction: avgSatisfaction[0]?.avg || 0
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};
