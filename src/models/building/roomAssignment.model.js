import mongoose from "mongoose";

const roomAssignmentSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },

  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true
  },

  buildingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    required: true
  },

  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    default: null
  },

  assignmentType: {
    type: String,
    enum: ["new", "transfer", "return"],
    default: "new"
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

  checkInDate: {
    type: Date,
    default: null
  },

  checkOutDate: {
    type: Date,
    default: null
  },

  status: {
    type: String,
    enum: ["active", "ended", "transferred"],
    default: "active"
  },

  previousAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomAssignment",
    default: null
  },

  transferReason: {
    type: String,
    trim: true
  },

  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  versionKey: false
});

roomAssignmentSchema.index({ studentId: 1, status: 1 });
roomAssignmentSchema.index({ studentId: 1, assignedAt: -1 });
roomAssignmentSchema.index({ roomId: 1, status: 1 });
roomAssignmentSchema.index({ buildingId: 1, status: 1 });
roomAssignmentSchema.index({ assignedAt: -1 });

export default mongoose.model("RoomAssignment", roomAssignmentSchema);
