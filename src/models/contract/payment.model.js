import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  paymentCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },

  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    required: true,
    index: true
  },

  invoiceCode: {
    type: String,
    required: true,
    trim: true
  },

  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    required: true
  },

  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
    index: true
  },

  amount: {
    type: Number,
    required: true,
    min: 0
  },

  paymentMethod: {
    type: String,
    enum: [
      "bank_transfer",  // Chuyển khoản ngân hàng
      "momo",           // Ví MoMo
      "vnpay",          // VNPay
      "zalopay",        // ZaloPay
      "cash",           // Tiền mặt
      "other"           // Khác
    ],
    required: true
  },

  status: {
    type: String,
    enum: [
      "pending",       // Chờ xử lý
      "processing",    // Đang xử lý
      "completed",     // Thành công
      "failed",        // Thất bại
      "cancelled",     // Đã hủy
      "refunded"       // Đã hoàn tiền
    ],
    default: "pending",
    index: true
  },

  // Thông tin thanh toán online
  gatewayTransactionId: {
    type: String,
    default: null,
    index: true
  },

  gatewayName: {
    type: String,
    enum: ["momo", "vnpay", "zalopay", null],
    default: null
  },

  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // Thông tin chuyển khoản ngân hàng
  bankTransfer: {
    bankName: String,
    accountNumber: String,
    accountHolder: String,
    transferContent: String,
    transferTime: Date,
    receiptImage: String
  },

  // Thông tin tiền mặt
  cashPayment: {
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    receivedAt: Date,
    receiptNumber: String,
    location: String
  },

  // Xác nhận từ admin
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  verifiedAt: {
    type: Date,
    default: null
  },

  verificationNotes: {
    type: String,
    trim: true,
    default: null
  },

  // Biên lai
  receipt: {
    receiptCode: String,
    issuedAt: Date,
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    pdfUrl: String
  },

  // Hoàn tiền
  refundInfo: {
    amount: Number,
    reason: String,
    refundedAt: Date,
    refundedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    refundMethod: String,
    refundTransactionId: String
  },

  // Thời gian
  paidAt: {
    type: Date,
    default: null
  },

  completedAt: {
    type: Date,
    default: null
  },

  // Metadata
  ipAddress: {
    type: String,
    default: null
  },

  userAgent: {
    type: String,
    default: null
  },

  notes: {
    type: String,
    trim: true,
    default: null
  },

  retryCount: {
    type: Number,
    default: 0,
    max: 5
  },

  lastRetryAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true,
  versionKey: false
});

paymentSchema.index({ invoiceId: 1, status: 1 });
paymentSchema.index({ studentId: 1, createdAt: -1 });
paymentSchema.index({ paymentMethod: 1, status: 1 });
// paymentSchema.index({ gatewayTransactionId: 1 }); // Removed - index: true in schema already creates index
paymentSchema.index({ "cashPayment.receiptNumber": 1 });
paymentSchema.index({ createdAt: -1 });

paymentSchema.virtual('isOnlinePayment').get(function() {
  return ["momo", "vnpay", "zalopay", "card"].includes(this.paymentMethod);
});

paymentSchema.virtual('isManualVerificationRequired').get(function() {
  return this.paymentMethod === "bank_transfer" || this.paymentMethod === "cash";
});

paymentSchema.methods.complete = async function(verifiedBy, notes) {
  this.status = "completed";
  this.verifiedBy = verifiedBy;
  this.verifiedAt = new Date();
  this.verificationNotes = notes;
  this.completedAt = new Date();

  if (!this.paidAt) {
    this.paidAt = new Date();
  }

  return this.save();
};

paymentSchema.methods.fail = async function(reason) {
  this.status = "failed";
  this.notes = reason;
  return this.save();
};

paymentSchema.methods.refund = async function(refundData) {
  this.status = "refunded";
  this.refundInfo = {
    amount: refundData.amount,
    reason: refundData.reason,
    refundedAt: new Date(),
    refundedBy: refundData.refundedBy,
    refundMethod: refundData.refundMethod,
    refundTransactionId: refundData.refundTransactionId
  };
  return this.save();
};

paymentSchema.methods.generateReceipt = async function(issuedBy) {
  const receiptCode = `REC${Date.now()}${Math.floor(Math.random() * 1000)}`;

  this.receipt = {
    receiptCode,
    issuedAt: new Date(),
    issuedBy
  };

  return this.save();
};

paymentSchema.methods.retry = async function() {
  if (this.retryCount >= 5) {
    throw new Error("Maximum retry attempts exceeded");
  }

  this.retryCount += 1;
  this.lastRetryAt = new Date();
  this.status = "processing";

  return this.save();
};

paymentSchema.statics.findByStudent = function(studentId, options = {}) {
  const { status, paymentMethod, page = 1, limit = 20 } = options;
  const filter = { studentId };

  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;

  return this.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("invoiceId", "invoiceCode month totalAmount")
    .populate("contractId", "contractCode")
    .populate("verifiedBy", "fullName");
};

paymentSchema.statics.findPendingVerification = function() {
  return this.find({
    status: "pending",
    $or: [
      { paymentMethod: "bank_transfer" },
      { paymentMethod: "cash" }
    ]
  }).populate("studentId", "studentId userId")
    .populate("invoiceId", "invoiceCode month totalAmount")
    .sort({ createdAt: 1 });
};

paymentSchema.statics.findByInvoice = function(invoiceId) {
  return this.find({ invoiceId })
    .sort({ createdAt: -1 })
    .populate("verifiedBy", "fullName");
};

paymentSchema.statics.getPaymentStats = async function(startDate, endDate) {
  const matchStage = {};

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          method: "$paymentMethod",
          status: "$status"
        },
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" }
      }
    },
    {
      $group: {
        _id: "$_id.method",
        statuses: {
          $push: {
            status: "$_id.status",
            count: "$count",
            totalAmount: "$totalAmount"
          }
        },
        totalCount: { $sum: "$count" },
        totalAmount: { $sum: "$totalAmount" }
      }
    }
  ]);
};

paymentSchema.statics.getDailyRevenue = async function(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await this.aggregate([
    {
      $match: {
        status: "completed",
        completedAt: { $gte: startOfDay, $lte: endOfDay }
      }
    },
    {
      $group: {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" }
      }
    }
  ]);

  return result;
};

export default mongoose.model("Payment", paymentSchema);
