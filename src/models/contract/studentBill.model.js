import mongoose from "mongoose";

const billItemSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true
  },

  description: {
    type: String,
    required: true
  },

  originalAmount: {
    type: Number,
    required: true
  },

  splitMethod: {
    type: String,
    enum: ["equal", "by_usage", "custom", "assigned", "full"],
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  percentage: {
    type: Number,
    default: 100
  },

  usage: {
    type: Number,
    default: null
  },

  unitPrice: {
    type: Number,
    default: null
  },

  ratio: {
    type: Number,
    default: null
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }

}, { _id: true });

const studentBillSchema = new mongoose.Schema({
  billCode: {
    type: String,
    required: true,
    unique: true
  },

  // Liên kết
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    required: true,
    index: true
  },

  invoiceCode: {
    type: String,
    required: true
  },

  parentInvoiceMonth: {
    type: String,
    required: true
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

  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    required: true
  },

  // Các khoản trong hóa đơn cá nhân
  items: [billItemSchema],

  // Tổng tiền
  subTotal: {
    type: Number,
    required: true
  },

  discount: {
    type: Number,
    default: 0
  },

  totalAmount: {
    type: Number,
    required: true
  },

  // Thanh toán
  paidAmount: {
    type: Number,
    default: 0
  },

  remainingAmount: {
    type: Number,
    default: function() {
      return this.totalAmount - this.paidAmount;
    }
  },

  status: {
    type: String,
    enum: [
      "pending",      // Chờ thanh toán
      "partial",      // Thanh toán một phần
      "paid",         // Đã thanh toán
      "overdue",      // Quá hạn
      "waived"        // Miễn giảm
    ],
    default: "pending"
  },

  dueDate: {
    type: Date,
    required: true
  },

  paidAt: {
    type: Date,
    default: null
  },

  // Thông tin chia tiền
  splitConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomBillingSplit",
    default: null
  },

  percentageOfTotal: {
    type: Number,
    required: true,
    description: "Phần trăm đóng góp vào hóa đơn tổng"
  },

  // Ghi chú
  notes: {
    type: String,
    default: null
  },

  // Lịch sử thanh toán
  paymentHistory: [{
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment"
    },
    amount: Number,
    paidAt: Date,
    method: String
  }],

  // Thông báo đã gửi
  notificationsSent: [{
    type: {
      type: String,
      enum: ["email", "push", "sms"]
    },
    sentAt: Date,
    status: String
  }],

  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  generatedAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true,
  versionKey: false
});

studentBillSchema.index({ invoiceId: 1, studentId: 1 }, { unique: true });
studentBillSchema.index({ studentId: 1, status: 1 });
studentBillSchema.index({ roomId: 1, parentInvoiceMonth: 1 });
studentBillSchema.index({ status: 1, dueDate: 1 });
// studentBillSchema.index({ billCode: 1 }); // Removed - unique: true in schema already creates index

// Virtual field để kiểm tra quá hạn
studentBillSchema.virtual('isOverdue').get(function() {
  return this.status !== "paid" && new Date() > this.dueDate;
});

// Virtual field số ngày còn lại đến hạn
studentBillSchema.virtual('daysUntilDue').get(function() {
  const diff = this.dueDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Phương thức thêm thanh toán
studentBillSchema.methods.addPayment = async function(amount, paymentId, method) {
  this.paidAmount += amount;

  this.paymentHistory.push({
    paymentId,
    amount,
    paidAt: new Date(),
    method
  });

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

// Phương thức đánh dấu quá hạn
studentBillSchema.methods.markOverdue = async function() {
  if (this.status !== "paid") {
    this.status = "overdue";
  }
  return this.save();
};

// Phương thức áp dụng giảm giá
studentBillSchema.methods.applyDiscount = async function(amount, reason) {
  this.discount = amount;
  this.totalAmount = Math.max(0, this.subTotal - this.discount);
  this.remainingAmount = this.totalAmount - this.paidAmount;

  if (!this.notes) {
    this.notes = `Discount: ${reason || ""}`;
  } else {
    this.notes += ` | Discount: ${reason || ""}`;
  }

  return this.save();
};

// Static methods
studentBillSchema.statics.findByStudent = function(studentId, options = {}) {
  const { status, page = 1, limit = 20 } = options;
  const filter = { studentId };

  if (status) filter.status = status;

  return this.find(filter)
    .populate("invoiceId", "invoiceCode month")
    .populate("roomId", "roomCode")
    .sort({ generatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

studentBillSchema.statics.findByInvoice = function(invoiceId) {
  return this.find({ invoiceId })
    .populate("studentId", "studentId userId")
    .populate({
      path: "studentId",
      populate: {
        path: "userId",
        select: "fullName email"
      }
    });
};

studentBillSchema.statics.findPendingByStudent = function(studentId) {
  return this.find({
    studentId,
    status: { $in: ["pending", "partial", "overdue"] }
  }).sort({ dueDate: 1 });
};

studentBillSchema.statics.findOverdue = function() {
  return this.find({
    status: { $in: ["pending", "partial"] },
    dueDate: { $lt: new Date() }
  }).populate("studentId", "studentId userId")
    .populate("roomId", "roomCode");
};

studentBillSchema.statics.getStudentBalance = async function(studentId) {
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
        totalPaid: { $sum: "$paidAmount" },
        totalBilled: { $sum: "$totalAmount" }
      }
    }
  ]);

  return result[0] || { totalOwed: 0, totalPaid: 0, totalBilled: 0 };
};

studentBillSchema.statics.getMonthlyStats = async function(yearMonth) {
  return this.aggregate([
    { $match: { parentInvoiceMonth: yearMonth } },
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

export default mongoose.model("StudentBill", studentBillSchema);
