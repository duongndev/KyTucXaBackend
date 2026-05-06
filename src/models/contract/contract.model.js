import mongoose from "mongoose";

const signatureSchema = new mongoose.Schema({
  signedAt: {
    type: Date,
    default: null
  },
  signatureUrl: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  signedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }
}, { _id: false });

const termSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  order: {
    type: Number,
    default: 0
  }
}, { _id: true });

const contractSchema = new mongoose.Schema({
  contractCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
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

  roomAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomAssignment",
    required: true
  },

  startDate: {
    type: Date,
    required: true
  },

  endDate: {
    type: Date,
    required: true
  },

  duration: {
    type: Number,
    required: true,
    min: 1,
    description: "Thời hạn hợp đồng tính bằng tháng"
  },

  depositAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },

  monthlyRent: {
    type: Number,
    required: true,
    min: 0
  },

  terms: [termSchema],

  status: {
    type: String,
    enum: [
      "draft",              // Mới tạo, chưa ký
      "pending_signature",  // Chờ chữ ký
      "active",             // Đã ký, đang hiệu lực
      "expired",            // Hết hạn
      "terminated",         // Chấm dứt trước hạn
      "cancelled"           // Hủy bỏ
    ],
    default: "draft",
    index: true
  },

  signatures: {
    student: signatureSchema,
    admin: signatureSchema
  },

  activatedAt: {
    type: Date,
    default: null
  },

  terminatedAt: {
    type: Date,
    default: null
  },

  terminationReason: {
    type: String,
    trim: true,
    default: null
  },

  terminatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  notes: {
    type: String,
    trim: true,
    default: null
  },

  isAutoRenew: {
    type: Boolean,
    default: false
  },

  renewedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    default: null
  },

  renewedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    default: null
  }

}, {
  timestamps: true,
  versionKey: false
});

contractSchema.index({ studentId: 1, status: 1 });
contractSchema.index({ roomId: 1, status: 1 });
contractSchema.index({ roomAssignmentId: 1 });
contractSchema.index({ status: 1, endDate: 1 });
contractSchema.index({ createdAt: -1 });

contractSchema.virtual('isExpired').get(function() {
  return this.endDate && new Date() > this.endDate;
});

contractSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.endDate) return null;
  const diff = this.endDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

contractSchema.virtual('isFullySigned').get(function() {
  return this.signatures.student.signedAt && this.signatures.admin.signedAt;
});

contractSchema.methods.signByStudent = async function(signatureData) {
  this.signatures.student = {
    signedAt: new Date(),
    signatureUrl: signatureData.signatureUrl,
    ipAddress: signatureData.ipAddress,
    userAgent: signatureData.userAgent
  };

  if (this.signatures.admin.signedAt) {
    this.status = "active";
    this.activatedAt = new Date();
  } else {
    this.status = "pending_signature";
  }

  return this.save();
};

contractSchema.methods.signByAdmin = async function(signatureData, adminId) {
  this.signatures.admin = {
    signedAt: new Date(),
    signatureUrl: signatureData.signatureUrl,
    ipAddress: signatureData.ipAddress,
    userAgent: signatureData.userAgent,
    signedBy: adminId
  };

  if (this.signatures.student.signedAt) {
    this.status = "active";
    this.activatedAt = new Date();
  } else {
    this.status = "pending_signature";
  }

  return this.save();
};

contractSchema.methods.terminate = async function(reason, terminatedBy) {
  this.status = "terminated";
  this.terminatedAt = new Date();
  this.terminationReason = reason;
  this.terminatedBy = terminatedBy;
  return this.save();
};

contractSchema.methods.renew = async function(newDuration, newEndDate) {
  this.isAutoRenew = true;
  this.duration = newDuration;
  this.endDate = newEndDate;
  return this.save();
};

contractSchema.statics.findActiveByStudent = function(studentId) {
  return this.findOne({
    studentId,
    status: { $in: ["active", "pending_signature"] }
  }).sort({ createdAt: -1 });
};

contractSchema.statics.findExpiringSoon = function(days = 30) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);

  return this.find({
    status: "active",
    endDate: { $lte: threshold, $gte: new Date() }
  }).populate("studentId", "studentId userId")
    .populate("roomId", "roomCode");
};

contractSchema.statics.findByRoom = function(roomId) {
  return this.find({ roomId })
    .sort({ createdAt: -1 })
    .populate("studentId", "studentId userId")
    .populate("roomAssignmentId");
};

export default mongoose.model("Contract", contractSchema);
