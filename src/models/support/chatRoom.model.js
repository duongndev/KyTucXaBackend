import mongoose from 'mongoose';

const chatRoomSchema = new mongoose.Schema({
  roomType: {
    type: String,
    enum: ['student_admin', 'group', 'ticket'],
    required: true
  },
  title: {
    type: String,
    trim: true
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['student', 'admin', 'staff'],
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastReadAt: {
      type: Date,
      default: null
    }
  }],
  relatedTicketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupportTicket',
    default: null
  },
  assignedAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'closed', 'archived'],
    default: 'active'
  },
  lastMessage: {
    content: String,
    senderId: mongoose.Schema.Types.ObjectId,
    sentAt: Date
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date,
    default: null
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

chatRoomSchema.index({ 'participants.userId': 1 });
chatRoomSchema.index({ status: 1, updatedAt: -1 });
chatRoomSchema.index({ relatedTicketId: 1 });

const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
export default ChatRoom;
