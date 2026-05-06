import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  answer: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'registration',    // Đăng ký ở KTX
      'room',            // Phòng ở
      'billing',         // Thanh toán
      'contract',        // Hợp đồng
      'maintenance',     // Sửa chữa
      'rules',           // Nội quy
      'facilities',      // Tiện ích
      'services',        // Dịch vụ
      'check_in_out',    // Nhận/trả phòng
      'other'            // Khác
    ]
  },
  keywords: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  viewCount: {
    type: Number,
    default: 0
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  notHelpfulCount: {
    type: Number,
    default: 0
  },
  order: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

faqSchema.index({ category: 1, order: 1 });
faqSchema.index({ isActive: 1, category: 1 });
faqSchema.index({ keywords: 'text', question: 'text' });

const FAQ = mongoose.model('FAQ', faqSchema);
export default FAQ;
