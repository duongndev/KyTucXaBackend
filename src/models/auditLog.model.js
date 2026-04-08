import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Có thể null cho anonymous actions
    },
    action: {
      type: String,
      required: true,
    },
    resource: {
      type: String, // Tên resource bị tác động (user, product, order, etc.)
      required: false,
    },
    resourceId: {
      type: String, // ID của resource
      required: false,
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // Chi tiết bổ sung
      default: {}
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    location: {
      country: String,
      city: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'LOW'
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'BLOCKED'],
      default: 'SUCCESS'
    },
    sessionId: {
      type: String, // Để track session
    },
    apiEndpoint: {
      type: String, // Endpoint được gọi
    },
    httpMethod: {
      type: String, // GET, POST, PUT, DELETE
    },
    responseTime: {
      type: Number, // Thời gian response (ms)
    },
    errorMessage: {
      type: String, // Lỗi nếu có
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index để tìm kiếm nhanh
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ ipAddress: 1, createdAt: -1 });
AuditLogSchema.index({ severity: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 }); // Cho pagination

// TTL index để tự động xóa log cũ sau 1 năm
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Static method để tạo log
AuditLogSchema.statics.createLog = function(logData) {
  return this.create({
    ...logData,
    createdAt: new Date()
  });
};

// Static method để tìm logs theo user
AuditLogSchema.statics.findByUser = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// Static method để tìm suspicious activities
AuditLogSchema.statics.findSuspiciousActivities = function(timeRange = 24) {
  const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
  
  return this.find({
    $or: [
      { severity: { $in: ['HIGH', 'CRITICAL'] } },
      { action: 'LOGIN_FAILED' },
      { status: 'BLOCKED' }
    ],
    createdAt: { $gte: since }
  })
  .sort({ createdAt: -1 })
  .lean();
};

export default mongoose.model("AuditLog", AuditLogSchema);