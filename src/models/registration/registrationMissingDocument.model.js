import mongoose from "mongoose";

const RegistrationMissingDocumentSchema = new mongoose.Schema({
  registrationForm: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RegistrationForm",
    required: true
  },

  documentType: {
    type: String,
    enum: [
      "cccd_front",
      "cccd_back",
      "student_card",
      "priority_proof",
      "stamped_form"
    ]
  },

  note: {
    type: String
  },

  isResolved: {
    type: Boolean,
    default: false
  },

  // Tham chiếu đến document đã upload để resolve
  resolvedDocument: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RegistrationDocument"
  },

  resolvedAt: Date

}, {
  timestamps: true,
  versionKey: false
});

export default mongoose.model("RegistrationMissingDocument", RegistrationMissingDocumentSchema);