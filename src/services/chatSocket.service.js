import { Server } from 'socket.io';
import { ChatRoom, ChatMessage } from '../models/support/index.js';
import jwt from 'jsonwebtoken';

class ChatSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
  }

  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      path: '/socket.io/chat'
    });

    this.io.use(this.authenticate.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));

    console.log('Chat Socket.IO initialized');
    return this.io;
  }

  async authenticate(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  }

  handleConnection(socket) {
    console.log(`User connected: ${socket.userId}`);
    this.connectedUsers.set(socket.userId.toString(), socket);

    socket.on('join_room', (data) => this.handleJoinRoom(socket, data));
    socket.on('leave_room', (data) => this.handleLeaveRoom(socket, data));
    socket.on('send_message', (data) => this.handleSendMessage(socket, data));
    socket.on('typing', (data) => this.handleTyping(socket, data));
    socket.on('mark_read', (data) => this.handleMarkRead(socket, data));
    socket.on('disconnect', () => this.handleDisconnect(socket));

    this.sendUnreadCount(socket);
  }

  async handleJoinRoom(socket, { roomId }) {
    try {
      const room = await ChatRoom.findOne({
        _id: roomId,
        'participants.userId': socket.userId
      });

      if (!room) {
        socket.emit('error', { message: 'Room not found or access denied' });
        return;
      }

      socket.join(roomId);
      socket.to(roomId).emit('user_joined', {
        userId: socket.userId,
        joinedAt: new Date()
      });

      socket.emit('joined_room', { roomId });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }

  handleLeaveRoom(socket, { roomId }) {
    socket.leave(roomId);
    socket.to(roomId).emit('user_left', {
      userId: socket.userId,
      leftAt: new Date()
    });
    socket.emit('left_room', { roomId });
  }

  async handleSendMessage(socket, { roomId, content, messageType = 'text', replyToId, tempId }) {
    try {
      const room = await ChatRoom.findOne({
        _id: roomId,
        'participants.userId': socket.userId,
        status: 'active'
      });

      if (!room) {
        socket.emit('error', { message: 'Room not found or closed' });
        return;
      }

      const message = await ChatMessage.create({
        roomId,
        senderId: socket.userId,
        senderRole: socket.userRole,
        messageType,
        content,
        replyTo: replyToId || null,
        readBy: [{ userId: socket.userId, readAt: new Date() }]
      });

      const populatedMessage = await ChatMessage.findById(message._id)
        .populate('senderId', 'fullName email avatar role');

      await ChatRoom.findByIdAndUpdate(roomId, {
        lastMessage: {
          content: content.substring(0, 100),
          senderId: socket.userId,
          sentAt: new Date()
        },
        updatedAt: new Date()
      });

      for (const participant of room.participants) {
        const pId = participant.userId.toString();
        if (pId !== socket.userId.toString()) {
          await ChatRoom.findByIdAndUpdate(roomId, {
            $inc: { [`unreadCount.${pId}`]: 1 }
          });
        }
      }

      const messageData = {
        ...populatedMessage.toObject(),
        tempId
      };

      this.io.to(roomId).emit('new_message', messageData);

      for (const participant of room.participants) {
        const pId = participant.userId.toString();
        if (pId !== socket.userId.toString()) {
          const userSocket = this.connectedUsers.get(pId);
          if (userSocket) {
            const roomDoc = await ChatRoom.findById(roomId);
            const unreadCount = roomDoc.unreadCount?.get(pId) || 0;
            userSocket.emit('unread_update', { roomId, unreadCount });
          }
        }
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }

  handleTyping(socket, { roomId, isTyping }) {
    socket.to(roomId).emit('typing', {
      userId: socket.userId,
      roomId,
      isTyping
    });
  }

  async handleMarkRead(socket, { roomId }) {
    try {
      await ChatMessage.updateMany(
        { roomId, 'readBy.userId': { $ne: socket.userId } },
        { $push: { readBy: { userId: socket.userId, readAt: new Date() } } }
      );

      await ChatRoom.findByIdAndUpdate(roomId, {
        $set: { [`unreadCount.${socket.userId}`]: 0 }
      });

      socket.to(roomId).emit('messages_read', {
        userId: socket.userId,
        roomId,
        readAt: new Date()
      });

      this.sendUnreadCount(socket);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }

  async sendUnreadCount(socket) {
    try {
      const rooms = await ChatRoom.find({
        'participants.userId': socket.userId,
        status: 'active'
      });

      let totalUnread = 0;
      for (const room of rooms) {
        totalUnread += room.unreadCount?.get(socket.userId.toString()) || 0;
      }

      socket.emit('unread_count', { totalUnread });
    } catch (error) {
      console.error('Error sending unread count:', error);
    }
  }

  handleDisconnect(socket) {
    console.log(`User disconnected: ${socket.userId}`);
    this.connectedUsers.delete(socket.userId.toString());
  }

  notifyTicketUpdate(roomId, update) {
    this.io.to(roomId).emit('ticket_update', update);
  }

  notifyNewTicket(ticket) {
    this.io.emit('new_ticket', {
      ticketId: ticket._id,
      ticketCode: ticket.ticketCode,
      title: ticket.title,
      priority: ticket.priority,
      category: ticket.category,
      createdAt: ticket.createdAt
    });
  }

  notifyTicketAssigned(ticket, adminId) {
    const adminSocket = this.connectedUsers.get(adminId.toString());
    if (adminSocket) {
      adminSocket.emit('ticket_assigned', {
        ticketId: ticket._id,
        ticketCode: ticket.ticketCode,
        title: ticket.title
      });
    }
  }
}

export default new ChatSocketService();
