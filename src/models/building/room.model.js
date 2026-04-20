import mongoose from "mongoose";

const facilitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    default: 1,
    min: 0
  },
  status: {
    type: String,
    enum: ["good", "broken", "maintenance"],
    default: "good"
  }
}, { _id: true });

const assignedStudentSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    default: null
  }
}, { _id: false });

const roomSchema = new mongoose.Schema({
  buildingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    required: true
  },

  roomNumber: {
    type: String,
    required: true,
    trim: true
  },

  floor: {
    type: Number,
    required: true,
    min: 0
  },

  roomCode: {
    type: String,
    required: true,
    trim: true
  },

  roomType: {
    type: String,
    enum: ["2-bed", "4-bed", "6-bed", "8-bed"],
    required: true
  },

  capacity: {
    type: Number,
    required: true,
    min: 1
  },

  currentOccupancy: {
    type: Number,
    default: 0,
    min: 0
  },

  roomStatus: {
    type: String,
    enum: ["available", "full", "maintenance", "reserved"],
    default: "available"
  },

  gender: {
    type: String,
    enum: ["male", "female"],
    required: true
  },

  area: {
    type: Number,
    default: 0
  },

  pricePerMonth: {
    type: Number,
    default: 0,
    min: 0
  },

  facilities: [facilitySchema],

  assignedStudents: [assignedStudentSchema],

  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  versionKey: false
});

roomSchema.index({ buildingId: 1, roomNumber: 1 }, { unique: true });
roomSchema.index({ roomCode: 1 }, { unique: true });
roomSchema.index({ buildingId: 1, floor: 1 });
roomSchema.index({ buildingId: 1, roomStatus: 1 });
roomSchema.index({ gender: 1, roomStatus: 1 });
roomSchema.index({ roomStatus: 1 });

export default mongoose.model("Room", roomSchema);
