import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: null
  }
}, { _id: true });

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  note: {
    type: String,
    default: null
  }
}, { _id: true });

const assignmentSchema = new mongoose.Schema({
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  estimatedCompletion: {
    type: Date,
    default: null
  },
  note: {
    type: String,
    default: null
  }
}, { _id: false });

const maintenanceRequestSchema = new mongoose.Schema({
  requestCode: {
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
    required: true,
    index: true
  },

  buildingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    required: true,
    index: true
  },

  category: {
    type: String,
    enum: [
      "electrical",      // Điện: công tắc, ổ cắm, đèn, quạt
      "plumbing",      // Nước: vòi nước, bồn cầu, thông tắc
      "furniture",     // Nội thất: giường, tủ, bàn ghế
      "door_window",   // Cửa và cửa sổ: khóa, bản lề, kính
      "ac",            // Máy lạnh
      "appliance",     // Thiết bị: tủ lạnh, máy giặt (nếu có)
      "network",       // Mạng internet, wifi
      "security",      // An ninh: camera, khóa cửa
      "cleaning",      // Vệ sinh: dọn dẹp, khử mùi
      "pest",          // Côn trùng: kiến, gián, muỗi
      "other"          // Khác
    ],
    required: true
  },

  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
    description: "low: Thấp, medium: Trung bình, high: Cao, urgent: Khẩn cấp"
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
    maxlength: 2000
  },

  images: [imageSchema],

  status: {
    type: String,
    enum: [
      "pending",        // Chờ xử lý
      "reviewing",      // Đang xem xét
      "assigned",       // Đã phân công
      "in_progress",    // Đang sửa chữa
      "paused",         // Tạm dừng
      "completed",      // Hoàn thành
      "cancelled",      // Đã hủy
      "rejected"        // Từ chối
    ],
    default: "pending"
  },

  statusHistory: [statusHistorySchema],

  assignment: {
    type: assignmentSchema,
    default: null
  },

  scheduledDate: {
    type: Date,
    default: null
  },

  completedDate: {
    type: Date,
    default: null
  },

  completionNote: {
    type: String,
    default: null,
    maxlength: 1000
  },

  completionImages: [imageSchema],

  cost: {
    materialCost: {
      type: Number,
      default: 0,
      min: 0
    },
    laborCost: {
      type: Number,
      default: 0,
      min: 0
    },
    totalCost: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  materialsUsed: [{
    name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    unit: {
      type: String,
      required: true
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],

  rating: {
    score: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    comment: {
      type: String,
      maxlength: 500,
      default: null
    },
    ratedAt: {
      type: Date,
      default: null
    }
  },

  isUrgent: {
    type: Boolean,
    default: false
  },

  isRecurring: {
    type: Boolean,
    default: false,
    description: "Có phải yêu cầu lặp lại không (vấn đề cũ tái diễn)"
  },

  relatedRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MaintenanceRequest",
    default: null,
    description: "Liên kết đến yêu cầu cũ nếu là tái diễn"
  },

  feedback: {
    type: String,
    maxlength: 1000,
    default: null
  },

  viewedByStudent: {
    type: Boolean,
    default: false
  },

  viewedByAdminAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true,
  versionKey: false
});

// Indexes
maintenanceRequestSchema.index({ studentId: 1, createdAt: -1 });
maintenanceRequestSchema.index({ roomId: 1, status: 1 });
maintenanceRequestSchema.index({ buildingId: 1, status: 1 });
maintenanceRequestSchema.index({ status: 1, priority: 1 });
maintenanceRequestSchema.index({ category: 1 });
maintenanceRequestSchema.index({ isUrgent: 1, createdAt: -1 });
maintenanceRequestSchema.index({ createdAt: -1 });

// Methods
maintenanceRequestSchema.methods.updateStatus = async function(newStatus, changedBy, note = null) {
  const oldStatus = this.status;
  this.status = newStatus;

  this.statusHistory.push({
    status: newStatus,
    changedBy,
    changedAt: new Date(),
    note: note || `Chuyển từ ${oldStatus} sang ${newStatus}`
  });

  if (newStatus === "completed") {
    this.completedDate = new Date();
  }

  return this.save();
};

maintenanceRequestSchema.methods.assignTo = async function(assignedTo, assignedBy, note = null, estimatedCompletion = null) {
  this.assignment = {
    assignedTo,
    assignedBy,
    assignedAt: new Date(),
    estimatedCompletion,
    note
  };
  this.status = "assigned";

  this.statusHistory.push({
    status: "assigned",
    changedBy: assignedBy,
    changedAt: new Date(),
    note: note || `Phân công cho technician: ${assignedTo}`
  });

  return this.save();
};

maintenanceRequestSchema.methods.addCompletionDetails = async function(note, images, costs, materials) {
  this.completionNote = note;
  if (images && images.length > 0) {
    this.completionImages = images;
  }
  if (costs) {
    this.cost = costs;
  }
  if (materials && materials.length > 0) {
    this.materialsUsed = materials;
  }

  return this.save();
};

maintenanceRequestSchema.methods.addRating = async function(score, comment) {
  this.rating = {
    score,
    comment,
    ratedAt: new Date()
  };
  return this.save();
};

// Statics
maintenanceRequestSchema.statics.findByStudent = function(studentId, options = {}) {
  const query = { studentId };
  if (options.status) {
    query.status = options.status;
  }

  return this.find(query)
    .populate("roomId", "roomCode roomNumber floor")
    .populate("buildingId", "buildingCode buildingName")
    .populate("assignment.assignedTo", "fullName email")
    .sort({ createdAt: -1 });
};

maintenanceRequestSchema.statics.findByRoom = function(roomId, options = {}) {
  const query = { roomId };
  if (options.status) {
    query.status = options.status;
  }
  if (options.excludeCompleted) {
    query.status = { $nin: ["completed", "cancelled", "rejected"] };
  }

  return this.find(query)
    .populate("studentId", "studentId")
    .populate("studentId.userId", "fullName email")
    .populate("assignment.assignedTo", "fullName")
    .sort({ createdAt: -1 });
};

maintenanceRequestSchema.statics.findPending = function(options = {}) {
  const query = { status: { $in: ["pending", "reviewing"] } };
  if (options.buildingId) {
    query.buildingId = options.buildingId;
  }
  if (options.category) {
    query.category = options.category;
  }

  return this.find(query)
    .populate("studentId", "studentId")
    .populate("studentId.userId", "fullName email phoneNumber")
    .populate("roomId", "roomCode roomNumber floor")
    .populate("buildingId", "buildingCode buildingName")
    .sort({ isUrgent: -1, priority: -1, createdAt: -1 });
};

maintenanceRequestSchema.statics.findAssignedTo = function(technicianId) {
  return this.find({
    "assignment.assignedTo": technicianId,
    status: { $in: ["assigned", "in_progress", "paused"] }
  })
    .populate("studentId", "studentId")
    .populate("studentId.userId", "fullName email phoneNumber")
    .populate("roomId", "roomCode roomNumber floor")
    .populate("buildingId", "buildingCode buildingName")
    .sort({ scheduledDate: 1, priority: -1 });
};

maintenanceRequestSchema.statics.getStatistics = async function(filters = {}) {
  const matchStage = {};
  if (filters.buildingId) matchStage.buildingId = new mongoose.Types.ObjectId(filters.buildingId);
  if (filters.roomId) matchStage.roomId = new mongoose.Types.ObjectId(filters.roomId);
  if (filters.startDate || filters.endDate) {
    matchStage.createdAt = {};
    if (filters.startDate) matchStage.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        byStatus: {
          $push: {
            k: "$status",
            v: { $sum: 1 }
          }
        },
        byCategory: {
          $push: {
            k: "$category",
            v: { $sum: 1 }
          }
        },
        byPriority: {
          $push: {
            k: "$priority",
            v: { $sum: 1 }
          }
        },
        urgentCount: {
          $sum: { $cond: [{ $eq: ["$isUrgent", true] }, 1, 0] }
        },
        avgCompletionTime: {
          $avg: {
            $cond: [
              { $and: ["$completedDate", "$createdAt"] },
              { $subtract: ["$completedDate", "$createdAt"] },
              null
            ]
          }
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    byStatus: {},
    byCategory: {},
    byPriority: {},
    urgentCount: 0,
    avgCompletionTime: 0
  };
};

export default mongoose.model("MaintenanceRequest", maintenanceRequestSchema);
