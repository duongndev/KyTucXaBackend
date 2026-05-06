import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "room_rent",        // Tiền phòng
      "electricity",      // Tiền điện
      "water",            // Tiền nước
      "internet",         // Internet
      "cleaning",         // Vệ sinh phòng
      "security",         // An ninh/bảo vệ
      "elevator",         // Thang máy
      "parking",          // Giữ xe
      "laundry",          // Giặt là (generic)
      "laundry_normal",   // Giặt thường
      "laundry_express",  // Giặt nhanh
      "laundry_steam",    // Giặt hấp
      "laundry_delivery", // Giao nhận giặt là
      "gym",              // Phòng gym
      "pool",             // Hồ bơi
      "ac",               // Máy lạnh (nếu phòng có)
      "furniture",        // Nội thất (nếu thuê thêm)
      "waste",            // Phí xử lý rác thải
      "pest_control",     // Phun thuốc diệt côn trùng
      "fire_safety",      // An toàn phòng cháy
      "deposit",          // Tiền đặt cọc (tháng đầu)
      "deposit_return",   // Hoàn trả cọc
      "penalty",          // Phí phạt
      "late_fee",         // Phí trễ hạn
      "maintenance",      // Phí bảo trì
      "other"             // Khác
    ],
    required: true
  },

  amount: {
    type: Number,
    required: true,
    min: 0
  },

  quantity: {
    type: Number,
    default: 1,
    min: 0
  },

  unitPrice: {
    type: Number,
    default: 0,
    min: 0
  },

  unit: {
    type: String,
    trim: true,
    default: null
  },

  usage: {
    type: Number,
    default: null,
    description: "Số điện/tháng, số nước/m³..."
  },

  description: {
    type: String,
    trim: true,
    default: null
  },

  meterReading: {
    current: Number,
    previous: Number,
    difference: Number
  }

}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  invoiceCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },

  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    required: true,
    index: true
  },

  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
    index: true
  },

  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true
  },

  month: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}$/,
    description: "Định dạng: YYYY-MM"
  },

  period: {
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    }
  },

  items: [invoiceItemSchema],

  subTotal: {
    type: Number,
    required: true,
    min: 0
  },

  discount: {
    type: Number,
    default: 0,
    min: 0
  },

  discountReason: {
    type: String,
    trim: true,
    default: null
  },

  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },

  dueDate: {
    type: Date,
    required: true
  },

  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  remainingAmount: {
    type: Number,
    default: function() {
      return this.totalAmount - this.paidAmount;
    }
  },

  paidAt: {
    type: Date,
    default: null
  },

  status: {
    type: String,
    enum: [
      "pending",      // Chờ thanh toán
      "partial",     // Thanh toán một phần
      "paid",        // Đã thanh toán đủ
      "overdue",     // Quá hạn
      "cancelled",   // Đã hủy
      "refunded"     // Đã hoàn tiền
    ],
    default: "pending",
    index: true
  },

  overdueDays: {
    type: Number,
    default: 0,
    min: 0
  },

  penaltyAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  penaltyRate: {
    type: Number,
    default: 0,
    description: "Tỷ lệ phạt mỗi ngày (%)"
  },

  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  generatedAt: {
    type: Date,
    default: Date.now
  },

  notes: {
    type: String,
    trim: true,
    default: null
  },

  isFirstInvoice: {
    type: Boolean,
    default: false,
    description: "Hóa đơn đầu tiên (có tiền cọc)"
  },

  pdfUrl: {
    type: String,
    default: null
  },

  sentAt: {
    type: Date,
    default: null,
    description: "Thời điểm gửi thông báo cho sinh viên"
  }

}, {
  timestamps: true,
  versionKey: false
});

invoiceSchema.index({ contractId: 1, month: 1 }, { unique: true });
invoiceSchema.index({ studentId: 1, status: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ month: 1 });
invoiceSchema.index({ createdAt: -1 });

invoiceSchema.virtual('isOverdue').get(function() {
  return this.status === "overdue" ||
    (this.status === "pending" && new Date() > this.dueDate);
});

invoiceSchema.virtual('daysUntilDue').get(function() {
  const diff = this.dueDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

invoiceSchema.virtual('remainingAmountCalc').get(function() {
  return this.totalAmount - this.paidAmount;
});

invoiceSchema.pre('save', function(next) {
  this.remainingAmount = this.totalAmount - this.paidAmount;
  next();
});

invoiceSchema.methods.addPayment = async function(amount) {
  this.paidAmount += amount;

  if (this.paidAmount >= this.totalAmount) {
    this.status = "paid";
    this.paidAt = new Date();
    this.remainingAmount = 0;
  } else {
    this.status = "partial";
    this.remainingAmount = this.totalAmount - this.paidAmount;
  }

  return this.save();
};

invoiceSchema.methods.markAsOverdue = async function() {
  const now = new Date();
  const overdueTime = now - this.dueDate;
  this.overdueDays = Math.ceil(overdueTime / (1000 * 60 * 60 * 24));

  if (this.penaltyRate > 0) {
    this.penaltyAmount = Math.round(
      (this.totalAmount * this.penaltyRate / 100) * this.overdueDays
    );
    this.totalAmount += this.penaltyAmount;
  }

  this.status = "overdue";
  return this.save();
};

invoiceSchema.methods.cancel = async function(reason) {
  this.status = "cancelled";
  this.notes = reason || "Đã hủy";
  return this.save();
};

invoiceSchema.methods.applyDiscount = async function(amount, reason) {
  this.discount = amount;
  this.discountReason = reason;
  this.totalAmount = Math.max(0, this.subTotal - this.discount);
  this.remainingAmount = this.totalAmount - this.paidAmount;
  return this.save();
};

invoiceSchema.statics.findByStudent = function(studentId, options = {}) {
  const { status, month, page = 1, limit = 20 } = options;
  const filter = { studentId };

  if (status) filter.status = status;
  if (month) filter.month = month;

  return this.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("contractId", "contractCode")
    .populate("roomId", "roomCode");
};

invoiceSchema.statics.findPendingByStudent = function(studentId) {
  return this.find({
    studentId,
    status: { $in: ["pending", "partial", "overdue"] }
  }).sort({ dueDate: 1 });
};

invoiceSchema.statics.findOverdue = function() {
  return this.find({
    status: { $in: ["pending", "partial"] },
    dueDate: { $lt: new Date() }
  }).populate("studentId", "studentId userId")
    .populate("contractId", "contractCode");
};

invoiceSchema.statics.getMonthlyStats = async function(yearMonth) {
  return this.aggregate([
    { $match: { month: yearMonth } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
        paidAmount: { $sum: "$paidAmount" }
      }
    }
  ]);
};

invoiceSchema.statics.getStudentBalance = async function(studentId) {
  const result = await this.aggregate([
    { $match: { studentId: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id: null,
        totalOwed: {
          $sum: {
            $cond: [
              { $in: ["$status", ["pending", "partial", "overdue"]] },
              { $subtract: ["$totalAmount", "$paidAmount"] },
              0
            ]
          }
        },
        totalPaid: { $sum: "$paidAmount" }
      }
    }
  ]);

  return result[0] || { totalOwed: 0, totalPaid: 0 };
};

export default mongoose.model("Invoice", invoiceSchema);
