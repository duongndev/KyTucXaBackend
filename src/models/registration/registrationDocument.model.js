import mongoose from "mongoose";

const RegistrationDocumentSchema = new mongoose.Schema({
  registrationForm: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RegistrationForm",
    required: true
  },

  type: {
    type: String,
    enum: [
      "cccd_front",      // CCCD mặt trước
      "cccd_back",       // CCCD mặt sau
      "student_card",    // Thẻ sinh viên/giấy báo nhập học
      "priority_proof",  // Giấy tờ ưu tiên
      "stamped_form",    // Đơn có dấu xác nhận
      "other"
    ],
    required: true
  },

  fileUrl: {
    type: String,
    required: true
  },

  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "verified"],
    default: "pending"
  },

  uploadedBy: {
    type: String,
    enum: ["student", "admin"],
    default: "student"
  },

  note: String

}, {
  timestamps: true,
  versionKey: false
});

export default mongoose.model("RegistrationDocument", RegistrationDocumentSchema);