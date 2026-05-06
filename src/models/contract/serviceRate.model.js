import mongoose from "mongoose";

const serviceRateSchema = new mongoose.Schema({
  serviceCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },

  serviceName: {
    type: String,
    required: true,
    trim: true
  },

  type: {
    type: String,
    enum: [
      "internet",         // Internet
      "cleaning",         // Vệ sinh phòng
      "security",         // An ninh/bảo vệ
      "elevator",         // Thang máy
      "parking",          // Giữ xe
      "laundry",          // Giặt là
      "gym",              // Phòng gym
      "pool",             // Hồ bơi
      "ac",               // Máy lạnh
      "furniture",        // Nội thất
      "waste",            // Xử lý rác
      "pest_control",     // Diệt côn trùng
      "fire_safety",      // An toàn cháy nổ
      "other"             // Khác
    ],
    required: true
  },

  billingType: {
    type: String,
    enum: [
      "fixed",            // Giá cố định/tháng
      "per_person",       // Theo đầu người
      "per_room",         // Theo phòng
      "per_usage",        // Theo lượt sử dụng
      "per_kwh",          // Theo kWh (cho AC)
      "per_hour"          // Theo giờ
    ],
    default: "fixed"
  },

  basePrice: {
    type: Number,
    required: true,
    min: 0,
    description: "Giá cơ bản (VNĐ)"
  },

  unit: {
    type: String,
    trim: true,
    default: "tháng",
    description: "Đơn vị tính (tháng, người, phòng, kWh...)"
  },

  isRequired: {
    type: Boolean,
    default: true,
    description: "Bắt buộc cho tất cả phòng"
  },

  isOptional: {
    type: Boolean,
    default: false,
    description: "Tùy chọn đăng ký thêm"
  },

  applicableTo: {
    type: String,
    enum: ["all", "standard", "premium", "shared", "private"],
    default: "all",
    description: "Áp dụng cho loại phòng nào"
  },

  description: {
    type: String,
    trim: true,
    default: null
  },

  isActive: {
    type: Boolean,
    default: true
  },

  effectiveFrom: {
    type: Date,
    default: Date.now
  },

  effectiveTo: {
    type: Date,
    default: null
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }

}, {
  timestamps: true,
  versionKey: false
});

serviceRateSchema.index({ type: 1, isActive: 1 });
// serviceRateSchema.index({ serviceCode: 1 }); // Removed - unique: true in schema already creates index
serviceRateSchema.index({ applicableTo: 1 });

serviceRateSchema.methods.calculateCost = function(occupants = 1, usage = 1) {
  switch (this.billingType) {
    case "fixed":
      return this.basePrice;
    case "per_person":
      return this.basePrice * occupants;
    case "per_room":
      return this.basePrice;
    case "per_usage":
      return this.basePrice * usage;
    case "per_kwh":
      return this.basePrice * usage;
    case "per_hour":
      return this.basePrice * usage;
    default:
      return this.basePrice;
  }
};

serviceRateSchema.statics.getActiveServices = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    effectiveFrom: { $lte: now },
    $or: [
      { effectiveTo: null },
      { effectiveTo: { $gte: now } }
    ]
  });
};

serviceRateSchema.statics.getRequiredServices = function() {
  return this.getActiveServices().where("isRequired", true);
};

serviceRateSchema.statics.getOptionalServices = function() {
  return this.getActiveServices().where("isOptional", true);
};

serviceRateSchema.statics.createDefaultServices = async function(adminId) {
  const defaultServices = [
    {
      serviceCode: "NET_BASIC",
      serviceName: "Internet Cơ Bản",
      type: "internet",
      billingType: "fixed",
      basePrice: 50000,
      unit: "tháng",
      isRequired: true,
      isOptional: false,
      applicableTo: "all",
      description: "Gói internet 50Mbps chia sẻ"
    },
    {
      serviceCode: "NET_PREMIUM",
      serviceName: "Internet Cao Cấp",
      type: "internet",
      billingType: "fixed",
      basePrice: 100000,
      unit: "tháng",
      isRequired: false,
      isOptional: true,
      applicableTo: "all",
      description: "Gói internet 100Mbps riêng phòng"
    },
    {
      serviceCode: "CLEANING",
      serviceName: "Vệ Sinh Phòng",
      type: "cleaning",
      billingType: "fixed",
      basePrice: 30000,
      unit: "tháng",
      isRequired: true,
      isOptional: false,
      applicableTo: "all",
      description: "Dọn vệ sinh phòng 2 lần/tuần"
    },
    {
      serviceCode: "SECURITY",
      serviceName: "An Ninh Bảo Vệ",
      type: "security",
      billingType: "fixed",
      basePrice: 20000,
      unit: "tháng",
      isRequired: true,
      isOptional: false,
      applicableTo: "all",
      description: "Bảo vệ 24/7, camera giám sát"
    },
    {
      serviceCode: "PARKING_MOTO",
      serviceName: "Giữ Xe Máy",
      type: "parking",
      billingType: "per_person",
      basePrice: 50000,
      unit: "xe/tháng",
      isRequired: false,
      isOptional: true,
      applicableTo: "all",
      description: "Giữ xe máy trong KTX"
    },
    {
      serviceCode: "PARKING_BIKE",
      serviceName: "Giữ Xe Đạp",
      type: "parking",
      billingType: "per_person",
      basePrice: 20000,
      unit: "xe/tháng",
      isRequired: false,
      isOptional: true,
      applicableTo: "all",
      description: "Giữ xe đạp trong KTX"
    },
    {
      serviceCode: "LAUNDRY_NORMAL",
      serviceName: "Giặt Thường",
      type: "laundry",
      billingType: "per_usage",
      basePrice: 15000,
      unit: "kg",
      isRequired: false,
      isOptional: true,
      applicableTo: "all",
      description: "Giặt thường 15,000đ/kg (3-5 ngày)",
      metadata: {
        processingTime: "3-5 ngày",
        serviceType: "normal"
      }
    },
    {
      serviceCode: "LAUNDRY_EXPRESS",
      serviceName: "Giặt Nhanh",
      type: "laundry",
      billingType: "per_usage",
      basePrice: 25000,
      unit: "kg",
      isRequired: false,
      isOptional: true,
      applicableTo: "all",
      description: "Giặt nhanh 25,000đ/kg (24 giờ)",
      metadata: {
        processingTime: "24 giờ",
        serviceType: "express"
      }
    },
    {
      serviceCode: "LAUNDRY_STEAM",
      serviceName: "Giặt Hấp",
      type: "laundry",
      billingType: "per_usage",
      basePrice: 35000,
      unit: "kg",
      isRequired: false,
      isOptional: true,
      applicableTo: "all",
      description: "Giặt hấp cao cấp 35,000đ/kg (khử khuẩn, là phẳng)",
      metadata: {
        processingTime: "2-3 ngày",
        serviceType: "steam",
        features: ["khử khuẩn", "là phẳng", "bảo quản vải"]
      }
    },
    {
      serviceCode: "LAUNDRY_DELIVERY",
      serviceName: "Giao Nhận Tận Phòng",
      type: "laundry",
      billingType: "per_usage",
      basePrice: 10000,
      unit: "lần",
      isRequired: false,
      isOptional: true,
      applicableTo: "all",
      description: "Phí giao nhận đồ giặt tận phòng 10,000đ/lần",
      metadata: {
        serviceType: "delivery",
        includes: ["pickup", "delivery"],
        note: "Tính theo lần giao nhận, không phụ thuộc số kg"
      }
    },
    {
      serviceCode: "GYM",
      serviceName: "Phòng Gym",
      type: "gym",
      billingType: "fixed",
      basePrice: 100000,
      unit: "tháng",
      isRequired: false,
      isOptional: true,
      applicableTo: "all",
      description: "Sử dụng phòng gym, thiết bị thể thao"
    },
    {
      serviceCode: "AC_USAGE",
      serviceName: "Máy Lạnh",
      type: "ac",
      billingType: "fixed",
      basePrice: 50000,
      unit: "tháng",
      isRequired: false,
      isOptional: true,
      applicableTo: "premium",
      description: "Phí duy trì máy lạnh (chưa bao gồm điện)"
    },
    {
      serviceCode: "WASTE",
      serviceName: "Xử Lý Rác Thải",
      type: "waste",
      billingType: "fixed",
      basePrice: 10000,
      unit: "tháng",
      isRequired: true,
      isOptional: false,
      applicableTo: "all",
      description: "Thu gom và xử lý rác thải"
    },
    {
      serviceCode: "PEST",
      serviceName: "Phun Thuốc Côn Trùng",
      type: "pest_control",
      billingType: "fixed",
      basePrice: 5000,
      unit: "tháng",
      isRequired: true,
      isOptional: false,
      applicableTo: "all",
      description: "Phun thuốc diệt muỗi, côn trùng định kỳ"
    },
    {
      serviceCode: "FIRE_SAFETY",
      serviceName: "An Toàn Phòng Cháy",
      type: "fire_safety",
      billingType: "fixed",
      basePrice: 5000,
      unit: "tháng",
      isRequired: true,
      isOptional: false,
      applicableTo: "all",
      description: "Bảo trì hệ thống PCCC, bình chữa cháy"
    }
  ];

  const results = {
    created: [],
    existing: []
  };

  for (const service of defaultServices) {
    const exists = await this.findOne({ serviceCode: service.serviceCode });
    if (!exists) {
      const created = await this.create({ ...service, createdBy: adminId });
      results.created.push(created);
    } else {
      results.existing.push(exists);
    }
  }

  return results;
};

export default mongoose.model("ServiceRate", serviceRateSchema);
