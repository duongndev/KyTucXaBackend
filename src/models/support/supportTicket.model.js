import mongoose from 'mongoose';
import AutoIncrement from 'mongoose-sequence';

const ticketSchema = new mongoose.Schema({
  ticketCode: {
    type: String,
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'room_issue',      // Vấn đề phòng ở
      'billing',         // Thanh toán, hóa đơn
      'maintenance',     // Sửa chữa, bảo trì
      'security',        // An ninh, an toàn
      'noise_complaint', // Khiếu nại ồn ào
      'roommate_issue',  // Vấn đề với roommate
      'facility',        // Cơ sở vật chất
      'internet',        // Mạng internet
      'other'            // Khác
    ]
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'escalated'],
    default: 'open'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },
  relatedRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  relatedContractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    default: null
  },
  relatedInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null
  },
  relatedMaintenanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MaintenanceRequest',
    default: null
  },
  attachments: [{
    url: String,
    filename: String,
    mimeType: String
  }],
  history: [{
    action: {
      type: String,
      enum: ['created', 'assigned', 'status_changed', 'priority_changed', 'commented', 'closed', 'reopened', 'escalated']
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedAt: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed
  }],
  tags: [{
    type: String,
    trim: true
  }],
  satisfactionRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  satisfactionComment: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  firstResponseAt: {
    type: Date,
    default: null
  },
  dueDate: {
    type: Date,
    default: null
  },
  isAutoAssigned: {
    type: Boolean,
    default: false
  },
  autoAssignmentReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });
ticketSchema.index({ createdBy: 1, status: 1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ category: 1 });
ticketSchema.index({ studentId: 1 });

ticketSchema.plugin(AutoIncrement(mongoose), {
  inc_field: 'ticketNumber',
  start_seq: 1000
});

ticketSchema.pre('save', function(next) {
  if (!this.ticketCode && this.ticketNumber) {
    this.ticketCode = `TK${this.ticketNumber}`;
  }
  next();
});

const SupportTicket = mongoose.model('SupportTicket', ticketSchema);
export default SupportTicket;
