import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },

  studentId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },

  university: {
    type: String,
    required: true,
    trim: true
  },

  major: String,
  className: String,
  academicYear: String,

  currentRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    default: null
  },

  currentContract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    default: null
  },

  studentStatus: {
    type: String,
    enum: ["studying", "graduated", "suspended"],
    default: "studying"
  },

  ktxStatus: {
    type: String,
    enum: [
      "not_registered",
      "waiting_room",
      "checked_in",
      "checked_out",
      "banned"
    ],
    default: "not_registered"
  },
}, {
  timestamps: true,
  versionKey: false
});


export default mongoose.model("Student", studentSchema);
