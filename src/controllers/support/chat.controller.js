import { ChatRoom, ChatMessage } from '../../models/support/index.js';
import User from '../../models/user/user.model.js';
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse
} from '../../utils/response.js';
import { buildPaginationMeta } from '../../helpers/pagination.js';
import * as notificationService from '../../services/notification.service.js';

export const createChatRoom = async (req, res) => {
  try {
    const { title, participantIds, roomType = 'student_admin' } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    const participants = [
      { userId, role: userRole, joinedAt: new Date() }
    ];

    if (participantIds && participantIds.length > 0) {
      const users = await User.find({ _id: { $in: participantIds } });
      users.forEach(user => {
        participants.push({
          userId: user._id,
          role: user.role,
          joinedAt: new Date()
        });
      });
    }

    const chatRoom = await ChatRoom.create({
      roomType,
      title: title || 'Chat Support',
      participants,
      status: 'active'
    });

    const populatedRoom = await ChatRoom.findById(chatRoom._id)
      .populate('participants.userId', 'fullName email avatar');

    return createdResponse(res, 'Tạo phòng chat thành công', populatedRoom);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getMyChatRooms = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { 'participants.userId': userId };
    if (status) query.status = status;

    const total = await ChatRoom.countDocuments(query);
    const rooms = await ChatRoom.find(query)
      .populate('participants.userId', 'fullName email avatar role')
      .populate('lastMessage.senderId', 'fullName')
      .sort({ 'lastMessage.sentAt': -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const roomsWithUnread = rooms.map(room => {
      const unreadCount = room.unreadCount?.get(userId.toString()) || 0;
      return { ...room.toObject(), myUnreadCount: unreadCount };
    });

    return successResponse(res, 'Lấy danh sách phòng chat thành công', {
      rooms: roomsWithUnread,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getChatRoomById = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await ChatRoom.findOne({
      _id: roomId,
      'participants.userId': userId
    })
      .populate('participants.userId', 'fullName email avatar role')
      .populate('assignedAdminId', 'fullName email');

    if (!room) {
      return notFoundResponse(res, 'Phòng chat không tồn tại');
    }

    return successResponse(res, 'Lấy thông tin phòng chat thành công', room);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;
    const { page = 1, limit = 30, before } = req.query;

    const room = await ChatRoom.findOne({
      _id: roomId,
      'participants.userId': userId
    });

    if (!room) {
      return notFoundResponse(res, 'Phòng chat không tồn tại');
    }

    const query = { roomId, isDeleted: false };
    if (before) query.createdAt = { $lt: new Date(before) };

    const total = await ChatMessage.countDocuments(query);
    const messages = await ChatMessage.find(query)
      .populate('senderId', 'fullName email avatar role')
      .populate('replyTo')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    await ChatMessage.updateMany(
      { roomId, 'readBy.userId': { $ne: userId } },
      { $push: { readBy: { userId, readAt: new Date() } } }
    );

    await ChatRoom.findByIdAndUpdate(roomId, {
      $set: { [`unreadCount.${userId}`]: 0 }
    });

    return successResponse(res, 'Lấy tin nhắn thành công', {
      messages: messages.reverse(),
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content, messageType = 'text', replyToId } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    const room = await ChatRoom.findOne({
      _id: roomId,
      'participants.userId': userId,
      status: 'active'
    });

    if (!room) {
      return notFoundResponse(res, 'Phòng chat không tồn tại hoặc đã đóng');
    }

    const message = await ChatMessage.create({
      roomId,
      senderId: userId,
      senderRole: userRole,
      messageType,
      content,
      replyTo: replyToId || null,
      readBy: [{ userId, readAt: new Date() }]
    });

    const populatedMessage = await ChatMessage.findById(message._id)
      .populate('senderId', 'fullName email avatar role');

    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: {
        content: content.substring(0, 100),
        senderId: userId,
        sentAt: new Date()
      },
      updatedAt: new Date()
    });

    const recipientIds = [];
    for (const participant of room.participants) {
      const pId = participant.userId.toString();
      if (pId !== userId.toString()) {
        await ChatRoom.findByIdAndUpdate(roomId, {
          $inc: { [`unreadCount.${pId}`]: 1 }
        });
        recipientIds.push(participant.userId);
      }
    }

    // Send notification to recipients
    if (recipientIds.length > 0) {
      const sender = await User.findById(userId);
      notificationService.sendToUsers(recipientIds, {
        type: 'chat_message',
        title: `Tin nhắn mới từ ${sender?.fullName || 'Admin'}`,
        message: content.substring(0, 100),
        data: {
          roomId: roomId.toString(),
          messageId: message._id.toString(),
          senderId: userId.toString(),
          senderName: sender?.fullName || 'Admin'
        }
      }).catch(err => console.error('Error sending chat notification:', err));
    }

    return createdResponse(res, 'Gửi tin nhắn thành công', populatedMessage);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const closeChatRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await ChatRoom.findOneAndUpdate(
      { _id: roomId, 'participants.userId': userId, status: 'active' },
      { status: 'closed', closedAt: new Date(), closedBy: userId },
      { new: true }
    );

    if (!room) {
      return notFoundResponse(res, 'Phòng chat không tồn tại');
    }

    return successResponse(res, 'Đóng phòng chat thành công', room);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const rooms = await ChatRoom.find({
      'participants.userId': userId,
      status: 'active'
    });

    let totalUnread = 0;
    const roomUnread = [];

    for (const room of rooms) {
      const unread = room.unreadCount?.get(userId.toString()) || 0;
      totalUnread += unread;
      roomUnread.push({ roomId: room._id, unreadCount: unread });
    }

    return successResponse(res, 'Lấy số tin nhắn chưa đọc thành công', {
      totalUnread,
      rooms: roomUnread
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const assignAdminToRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { adminId } = req.body;

    const room = await ChatRoom.findByIdAndUpdate(
      roomId,
      {
        assignedAdminId: adminId,
        $addToSet: {
          participants: { userId: adminId, role: 'admin', joinedAt: new Date() }
        }
      },
      { new: true }
    ).populate('participants.userId', 'fullName email avatar role');

    if (!room) {
      return notFoundResponse(res, 'Phòng chat không tồn tại');
    }

    return successResponse(res, 'Phân công admin thành công', room);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getAllChatRooms = async (req, res) => {
  try {
    const { status, assignedTo, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (assignedTo) query.assignedAdminId = assignedTo;

    const total = await ChatRoom.countDocuments(query);
    const rooms = await ChatRoom.find(query)
      .populate('participants.userId', 'fullName email avatar role')
      .populate('assignedAdminId', 'fullName email')
      .populate('relatedTicketId', 'ticketCode title status')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return successResponse(res, 'Lấy danh sách phòng chat thành công', {
      rooms,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};
