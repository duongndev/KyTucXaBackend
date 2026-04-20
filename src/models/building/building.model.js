import mongoose from "mongoose";

const buildingSchema = new mongoose.Schema({
  buildingCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },

  buildingName: {
    type: String,
    required: true,
    trim: true
  },

  buildingType: {
    type: String,
    enum: ["male", "female", "mixed"],
    required: true
  },

  totalFloors: {
    type: Number,
    required: true,
    min: 1
  },

  address: {
    type: String,
    trim: true
  },

  description: {
    type: String,
    trim: true
  },

  status: {
    type: String,
    enum: ["active", "inactive", "maintenance"],
    default: "active"
  },

  amenities: [{
    type: String,
    trim: true
  }],

  stats: {
    totalRooms: {
      type: Number,
      default: 0
    },
    availableRooms: {
      type: Number,
      default: 0
    },
    occupiedRooms: {
      type: Number,
      default: 0
    },
    totalCapacity: {
      type: Number,
      default: 0
    },
    currentOccupancy: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  versionKey: false
});

buildingSchema.index({ status: 1 });
buildingSchema.index({ buildingType: 1, status: 1 });

export default mongoose.model("Building", buildingSchema);
