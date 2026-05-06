import mongoose from "mongoose";

const semesterInvoiceSchema = new mongoose.Schema({
  invoiceCode: {
    type: String,
    required: true,
    unique: true,
    trim: true
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

  billingCycle: {
    type: String,
    required: true,
    enum: ["semester", "6month", "3month", "12month", "custom"],
    default: "6month",
    description: "Chu kỳ thanh toán: semester, 6month, 3month, 12month, custom"
  },

  periodName: {
    type: String,
    required: true,
    description: "Tên đợt thanh toán (ví dụ: 'T1-T6/2026', 'Kỳ 1/2026')"
  },

  year: {
    type: Number,
    required: true
  },

  periodNumber: {
    type: Number,
    default: 1,
    description: "Số thứ tự đợt trong năm (1, 2, ...)"
  },

  period: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    durationMonths: {
      type: Number,
      default: 6
    }
  },

  // Chi tiết tiền phòng
  roomRent: {
    monthlyRate: {
      type: Number,
      required: true
    },
    totalMonths: {
      type: Number,
      default: 6
    },
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
    }
  },

  // Đã thanh toán
  paidAmount: {
    type: Number,
    default: 0
  },

  remainingAmount: {
    type: Number,
    default: function() {
      return this.roomRent.totalAmount - this.paidAmount;
    }
  },

  status: {
    type: String,
    enum: [
      "pending",      // Chờ thanh toán
      "partial",      // Thanh toán một phần
      "paid",         // Đã thanh toán đủ
      "overdue",      // Quá hạn
      "cancelled"     // Đã hủy
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

  // Thông tin chia tiền (nếu có nhiều người trong phòng)
  splitInfo: {
    isSplit: {
      type: Boolean,
      default: false
    },
    totalRoommates: {
      type: Number,
      default: 1
    },
    myShare: {
      type: Number,
      default: 100
    },
    originalTotal: {
      type: Number,
      default: null
    }
  },

  // Lịch sử thanh toán
  paymentHistory: [{
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment"
    },
    amount: Number,
    paidAt: Date,
    method: String,
    notes: String
  }],

  notes: {
    type: String,
    trim: true,
    default: null
  },

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

semesterInvoiceSchema.index({ contractId: 1, billingCycle: 1, year: 1, periodNumber: 1 }, { unique: true });
semesterInvoiceSchema.index({ studentId: 1, status: 1 });
semesterInvoiceSchema.index({ status: 1, dueDate: 1 });
semesterInvoiceSchema.index({ year: 1, billingCycle: 1 });

// Virtual kiểm tra quá hạn
semesterInvoiceSchema.virtual('isOverdue').get(function() {
  return this.status !== "paid" && new Date() > this.dueDate;
});

semesterInvoiceSchema.virtual('daysUntilDue').get(function() {
  const diff = this.dueDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Phương thức thêm thanh toán
semesterInvoiceSchema.methods.addPayment = async function(amount, paymentId, method, notes) {
  this.paidAmount += amount;

  this.paymentHistory.push({
    paymentId,
    amount,
    paidAt: new Date(),
    method,
    notes
  });

  if (this.paidAmount >= this.roomRent.totalAmount) {
    this.status = "paid";
    this.paidAt = new Date();
    this.remainingAmount = 0;
  } else {
    this.status = "partial";
    this.remainingAmount = this.roomRent.totalAmount - this.paidAmount;
  }

  return this.save();
};

// Phương thức đánh dấu quá hạn
semesterInvoiceSchema.methods.markOverdue = async function() {
  if (this.status !== "paid") {
    this.status = "overdue";
  }
  return this.save();
};

// Phương thức áp dụng giảm giá
semesterInvoiceSchema.methods.applyDiscount = async function(amount, reason) {
  this.roomRent.discount = amount;
  this.roomRent.totalAmount = Math.max(0, this.roomRent.subTotal - amount);
  this.remainingAmount = this.roomRent.totalAmount - this.paidAmount;

  if (reason) {
    this.notes = this.notes ? `${this.notes} | Discount: ${reason}` : `Discount: ${reason}`;
  }

  return this.save();
};

// Static methods
semesterInvoiceSchema.statics.findByStudent = function(studentId, options = {}) {
  const { status, year, billingCycle, page = 1, limit = 20 } = options;
  const filter = { studentId };

  if (status) filter.status = status;
  if (year) filter.year = year;
  if (billingCycle) filter.billingCycle = billingCycle;

  return this.find(filter)
    .populate("contractId", "contractCode")
    .populate("roomId", "roomCode")
    .sort({ year: -1, periodNumber: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

semesterInvoiceSchema.statics.findPendingByStudent = function(studentId) {
  return this.find({
    studentId,
    status: { $in: ["pending", "partial", "overdue"] }
  }).sort({ dueDate: 1 });
};

semesterInvoiceSchema.statics.findOverdue = function() {
  return this.find({
    status: { $in: ["pending", "partial"] },
    dueDate: { $lt: new Date() }
  }).populate("studentId", "studentId userId")
    .populate("roomId", "roomCode");
};

semesterInvoiceSchema.statics.getStudentBalance = async function(studentId) {
  const result = await this.aggregate([
    { $match: { studentId: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id: null,
        totalOwed: {
          $sum: {
            $cond: [
              { $in: ["$status", ["pending", "partial", "overdue"]] },
              { $subtract: ["$roomRent.totalAmount", "$paidAmount"] },
              0
            ]
          }
        },
        totalPaid: { $sum: "$paidAmount" },
        totalBilled: { $sum: "$roomRent.totalAmount" }
      }
    }
  ]);

  return result[0] || { totalOwed: 0, totalPaid: 0, totalBilled: 0 };
};

semesterInvoiceSchema.statics.getBillingStats = async function(year, billingCycle) {
  const matchStage = { year };
  if (billingCycle) matchStage.billingCycle = billingCycle;

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$roomRent.totalAmount" },
        paidAmount: { $sum: "$paidAmount" }
      }
    }
  ]);
};

// Helper để tính toán chu kỳ thanh toán
semesterInvoiceSchema.statics.calculatePeriodDates = function(year, periodNumber, billingCycle = "6month") {
  let durationMonths = 6;
  let startMonth, endMonth;

  switch (billingCycle) {
    case "6month":
      durationMonths = 6;
      startMonth = (periodNumber - 1) * 6 + 1;
      endMonth = periodNumber * 6;
      break;
    case "3month":
      durationMonths = 3;
      startMonth = (periodNumber - 1) * 3 + 1;
      endMonth = periodNumber * 3;
      break;
    case "12month":
      durationMonths = 12;
      startMonth = 1;
      endMonth = 12;
      break;
    case "semester":
      if (periodNumber === 1) {
        durationMonths = 6;
        startMonth = 1;
        endMonth = 6;
      } else {
        durationMonths = 6;
        startMonth = 7;
        endMonth = 12;
      }
      break;
    default:
      durationMonths = 6;
      startMonth = (periodNumber - 1) * 6 + 1;
      endMonth = periodNumber * 6;
  }

  // Handle year boundary
  let actualYear = year;
  if (endMonth > 12) {
    actualYear = year + 1;
    endMonth = endMonth - 12;
  }

  return {
    startDate: new Date(year, startMonth - 1, 1),
    endDate: new Date(actualYear, endMonth, 0),
    durationMonths,
    periodName: `T${startMonth}-T${endMonth > 12 ? endMonth - 12 : endMonth}/${actualYear}`
  };
};

export default mongoose.model("SemesterInvoice", semesterInvoiceSchema);
