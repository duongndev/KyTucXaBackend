import mongoose from "mongoose";

const registrationFormSchema = new mongoose.Schema({
  registrationFormCode: {
    type: String,
    unique: true,
    required: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false
  },

  submissionType: {
    type: String,
    enum: ["online", "offline"],
    default: "online"
  },

  status: {
    type: String,
    enum: [
      "draft",
      "submitted",
      "missing_document",
      "resubmitted",
      "pending",
      "approved",
      "rejected",
      "pending_offline",
      "received_offline",
      "processing"
    ],
    default: "draft"
  },

  formData: {
    type: Object
  },

  isMissingDocuments: {
    type: Boolean,
    default: false
  },

  resubmitCount: {
    type: Number,
    default: 0
  },

  deadline: Date,

  // Theo dõi step hiện tại (0: offline, 1: nội trú, 2: tạm trú, 3: upload, 4: hoàn thành)
  currentStep: {
    type: Number,
    enum: [0, 1, 2, 3, 4],
    default: 0
  },

  // Nguồn tạo form (user/admin)
  source: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
  },

  // Thông tin tiếp nhận đơn giấy (offline)
  receivedAt: Date,
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  receivedNote: String,

  // Thông tin xử lý (processing)
  processingStartedAt: Date,
  processingNote: String,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  // Thông tin phê duyệt
  approvalNotes: String,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  // Thông tin từ chối
  rejectionReason: String,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  // Các step đã hoàn thành
  completedSteps: {
    type: [Number],
    default: []
  },

  // Theo dõi documents bắt buộc đã upload
  requiredDocuments: {
    cccdFront: { type: Boolean, default: false },
    cccdBack: { type: Boolean, default: false },
    studentCard: { type: Boolean, default: false },
    priorityDoc: { type: Boolean, default: false },
    stampedForm: { type: Boolean, default: false }
  },

  // Có thể submit mà không cần stampedForm ngay
  canSubmitWithoutStamp: {
    type: Boolean,
    default: true
  },

  // Deadline upload đơn có dấu (nếu chưa upload khi submit)
  stampedFormDeadline: Date,

  signature: {
    type: String // base64 hoặc url
  },

  isLocked: {
    type: Boolean,
    default: false
  },

  submittedAt: Date,
  approvedAt: Date,
  rejectedAt: Date

}, {
  timestamps: true,
  versionKey: false
});

export default mongoose.model("RegistrationForm", registrationFormSchema);