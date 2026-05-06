import mongoose from "mongoose";

const meterDataSchema = new mongoose.Schema({
  previous: {
    type: Number,
    required: true,
    min: 0,
    description: "Chỉ số đầu kỳ"
  },

  current: {
    type: Number,
    required: true,
    min: 0,
    description: "Chỉ số cuối kỳ"
  },

  usage: {
    type: Number,
    required: true,
    min: 0,
    description: "Tiêu thụ = current - previous"
  },

  meterNumber: {
    type: String,
    trim: true,
    default: null,
    description: "Số seri đồng hồ"
  },

  imageUrl: {
    type: String,
    default: null,
    description: "Ảnh chụp đồng hồ (chứng minh)"
  },

  isEstimated: {
    type: Boolean,
    default: false,
    description: "Có phải ước tính không (khi không đọc được đồng hồ)"
  }

}, { _id: false });

const meterReadingSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
    index: true
  },

  month: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}$/,
    description: "Định dạng: YYYY-MM"
  },

  year: {
    type: Number,
    required: true
  },

  electricity: {
    type: meterDataSchema,
    required: true
  },

  water: {
    type: meterDataSchema,
    required: true
  },

  readBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    description: "Người ghi chỉ số"
  },

  readAt: {
    type: Date,
    required: true,
    default: Date.now
  },

  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    description: "Người kiểm tra (nếu có)"
  },

  verifiedAt: {
    type: Date,
    default: null
  },

  status: {
    type: String,
    enum: [
      "pending",      // Chờ kiểm tra
      "verified",     // Đã xác nhận
      "billed",       // Đã xuất hóa đơn
      "disputed"      // Có tranh chấp
    ],
    default: "pending"
  },

  notes: {
    type: String,
    trim: true,
    default: null
  },

  isAutoRead: {
    type: Boolean,
    default: false,
    description: "Tự động đọc từ smart meter"
  },

  deviceId: {
    type: String,
    default: null,
    description: "ID thiết bị smart meter (nếu có)"
  },

  calculatedAmounts: {
    electricity: {
      type: Number,
      default: null
    },
    water: {
      type: Number,
      default: null
    }
  }

}, {
  timestamps: true,
  versionKey: false
});

meterReadingSchema.index({ roomId: 1, month: 1 }, { unique: true });
meterReadingSchema.index({ year: 1, month: 1 });
meterReadingSchema.index({ status: 1 });
meterReadingSchema.index({ readAt: -1 });

meterReadingSchema.pre('save', function(next) {
  if (this.electricity.current < this.electricity.previous) {
    return next(new Error("Electricity current reading cannot be less than previous"));
  }
  if (this.water.current < this.water.previous) {
    return next(new Error("Water current reading cannot be less than previous"));
  }

  this.electricity.usage = this.electricity.current - this.electricity.previous;
  this.water.usage = this.water.current - this.water.previous;

  next();
});

meterReadingSchema.methods.verify = async function(verifiedBy) {
  this.status = "verified";
  this.verifiedBy = verifiedBy;
  this.verifiedAt = new Date();
  return this.save();
};

meterReadingSchema.methods.markAsBilled = async function() {
  this.status = "billed";
  return this.save();
};

meterReadingSchema.methods.dispute = async function(reason) {
  this.status = "disputed";
  this.notes = reason || this.notes;
  return this.save();
};

meterReadingSchema.statics.findByRoom = function(roomId, options = {}) {
  const { year, month, limit = 12 } = options;
  const filter = { roomId };

  if (year) filter.year = year;
  if (month) filter.month = month;

  return this.find(filter)
    .sort({ year: -1, month: -1 })
    .limit(limit)
    .populate("readBy", "fullName")
    .populate("verifiedBy", "fullName");
};

meterReadingSchema.statics.findByMonth = function(year, month) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  return this.find({ month: monthStr, status: { $in: ["pending", "verified"] } })
    .populate("roomId", "roomCode roomNumber buildingId")
    .populate({
      path: "roomId",
      populate: {
        path: "buildingId",
        select: "buildingCode buildingName"
      }
    })
    .populate("readBy", "fullName");
};

meterReadingSchema.statics.getLastReading = async function(roomId) {
  return this.findOne({ roomId })
    .sort({ year: -1, month: -1 })
    .select("electricity.current water.current month");
};

meterReadingSchema.statics.getUnbilledReadings = function(year, month) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  return this.find({
    month: monthStr,
    status: { $in: ["pending", "verified"] }
  }).populate("roomId", "roomCode");
};

meterReadingSchema.statics.getMonthlyStats = async function(year, month) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  return this.aggregate([
    { $match: { month: monthStr } },
    {
      $group: {
        _id: null,
        totalElectricityUsage: { $sum: "$electricity.usage" },
        totalWaterUsage: { $sum: "$water.usage" },
        avgElectricityUsage: { $avg: "$electricity.usage" },
        avgWaterUsage: { $avg: "$water.usage" },
        count: { $sum: 1 }
      }
    }
  ]);
};

export default mongoose.model("MeterReading", meterReadingSchema);
