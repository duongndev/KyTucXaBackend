import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  feedbackType: {
    type: String,
    required: true,
    enum: [
      'room_service',      // Dịch vụ phòng
      'maintenance',       // Bảo trì/sửa chữa
      'security',          // An ninh/bảo vệ
      'cleaning',          // Vệ sinh
      'staff_attitude',    // Thái độ nhân viên
      'facility',          // Cơ sở vật chất
      'billing',           // Hóa đơn/thanh toán
      'food',              // Ăn uống (nếu có)
      'laundry',           // Giặt là
      'general'            // Chung
    ]
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  relatedRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  relatedTicketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupportTicket',
    default: null
  },
  relatedServiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    trim: true,
    maxlength: 200
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  aspects: {
    cleanliness: { type: Number, min: 1, max: 5, default: null },
    staff_service: { type: Number, min: 1, max: 5, default: null },
    facilities: { type: Number, min: 1, max: 5, default: null },
    value_for_money: { type: Number, min: 1, max: 5, default: null },
    responsiveness: { type: Number, min: 1, max: 5, default: null }
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolutionNote: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  adminResponse: {
    content: String,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date
  },
  tags: [{
    type: String,
    trim: true
  }],
  sentiment: {
    type: String,
    enum: ['positive', 'neutral', 'negative'],
    default: null
  }
}, {
  timestamps: true
});

feedbackSchema.index({ studentId: 1, createdAt: -1 });
feedbackSchema.index({ feedbackType: 1, rating: 1 });
feedbackSchema.index({ isResolved: 1, createdAt: -1 });
feedbackSchema.index({ createdAt: -1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);
export default Feedback;
