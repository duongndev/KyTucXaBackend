import mongoose from "mongoose";

const splitConfigSchema = new mongoose.Schema({
  itemType: {
    type: String,
    enum: [
      "room_rent",
      "electricity",
      "water",
      "internet",
      "cleaning",
      "security",
      "elevator",
      "parking",
      "laundry",
      "gym",
      "pool",
      "ac",
      "furniture",
      "waste",
      "pest_control",
      "fire_safety",
      "other"
    ],
    required: true
  },

  splitMethod: {
    type: String,
    enum: [
      "equal",           // Chia đều
      "by_area",         // Theo diện tích (nếu phòng có khu vực khác nhau)
      "by_usage",        // Theo mức sử dụng (điện/nước theo đầu người)
      "custom",          // Tỷ lệ tùy chỉnh
      "assigned"         // Ai dùng người đó trả (ví dụ: xe, giặt là)
    ],
    default: "equal"
  },

  customRatios: [{
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student"
    },
    ratio: {
      type: Number,
      min: 0,
      max: 1
    }
  }],

  isActive: {
    type: Boolean,
    default: true
  }

}, { _id: true });

const studentShareSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },

  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    description: "Phần trăm đóng góp (mặc định chia đều)"
  },

  isPayer: {
    type: Boolean,
    default: true,
    description: "Có phải người thanh toán không"
  },

  joinedAt: {
    type: Date,
    default: Date.now
  },

  leftAt: {
    type: Date,
    default: null
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, { _id: true });

const roomBillingSplitSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
    unique: true,
    index: true
  },

  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
    required: true
  },

  // Cấu hình chia tiền theo loại
  splitConfigs: [splitConfigSchema],

  // Danh sách sinh viên và tỷ lệ đóng góp
  studentShares: [studentShareSchema],

  // Cài đặt chung
  defaultSplitMethod: {
    type: String,
    enum: ["equal", "by_usage", "custom"],
    default: "equal"
  },

  // Điện nước có chia theo đầu người không
  utilitiesSplitByPerson: {
    type: Boolean,
    default: true
  },

  // Có tự động tách hóa đơn không
  autoSplitInvoice: {
    type: Boolean,
    default: true
  },

  // Sinh viên đại diện thanh toán chung (nếu có)
  primaryPayerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    default: null
  },

  // Ghi chú đặc biệt về chia tiền
  notes: {
    type: String,
    trim: true,
    default: null
  },

  isActive: {
    type: Boolean,
    default: true
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

roomBillingSplitSchema.index({ roomId: 1, isActive: 1 });
roomBillingSplitSchema.index({ contractId: 1 });

// Phương thức tính chia tiền cho từng sinh viên
roomBillingSplitSchema.methods.calculateSplit = function(invoiceItems, totalOccupants = null) {
  const occupants = totalOccupants || this.studentShares.filter(s => s.isActive).length;
  const result = {};

  // Khởi tạo kết quả cho từng sinh viên
  for (const share of this.studentShares.filter(s => s.isActive)) {
    result[share.studentId.toString()] = {
      studentId: share.studentId,
      items: [],
      subTotal: 0,
      percentage: share.percentage || (100 / occupants)
    };
  }

  // Chia từng khoản
  for (const item of invoiceItems) {
    const config = this.splitConfigs.find(c => c.itemType === item.type && c.isActive);
    const method = config?.splitMethod || this.defaultSplitMethod || "equal";

    switch (method) {
      case "equal":
        this.splitEqually(item, result, occupants);
        break;
      case "by_usage":
        this.splitByUsage(item, result, occupants, config);
        break;
      case "custom":
        this.splitByCustomRatio(item, result, config?.customRatios);
        break;
      case "assigned":
        // Không chia, gán cho người sử dụng cụ thể
        break;
      default:
        this.splitEqually(item, result, occupants);
    }
  }

  // Tính tổng cho mỗi người
  for (const studentId in result) {
    result[studentId].total = result[studentId].items.reduce((sum, item) => sum + item.amount, 0);
  }

  return result;
};

roomBillingSplitSchema.methods.splitEqually = function(item, result, occupants) {
  const equalAmount = Math.round(item.amount / occupants);
  const remainder = item.amount - (equalAmount * occupants);

  let first = true;
  for (const studentId in result) {
    let amount = equalAmount;
    if (first && remainder > 0) {
      amount += remainder; // Người đầu chịu phần lẻ
      first = false;
    }

    result[studentId].items.push({
      type: item.type,
      description: item.description,
      originalAmount: item.amount,
      splitMethod: "equal",
      amount: amount,
      percentage: 100 / occupants
    });

    result[studentId].subTotal += amount;
  }
};

roomBillingSplitSchema.methods.splitByUsage = function(item, result, occupants, config) {
  // Điện/nước chia theo đầu người hoặc theo tỷ lệ sử dụng
  if (item.type === "electricity" || item.type === "water") {
    const usagePerPerson = item.usage / occupants;
    const pricePerUnit = item.amount / item.usage;

    for (const studentId in result) {
      const amount = Math.round(usagePerPerson * pricePerUnit);

      result[studentId].items.push({
        type: item.type,
        description: item.description,
        originalAmount: item.amount,
        originalUsage: item.usage,
        splitMethod: "by_usage",
        usage: usagePerPerson,
        unitPrice: pricePerUnit,
        amount: amount,
        percentage: 100 / occupants
      });

      result[studentId].subTotal += amount;
    }
  } else {
    // Các khoản khác chia đều
    this.splitEqually(item, result, occupants);
  }
};

roomBillingSplitSchema.methods.splitByCustomRatio = function(item, result, customRatios) {
  if (!customRatios || customRatios.length === 0) {
    // Fallback về chia đều
    const activeStudents = Object.keys(result).length;
    this.splitEqually(item, result, activeStudents);
    return;
  }

  const ratioMap = {};
  let totalRatio = 0;

  for (const ratio of customRatios) {
    ratioMap[ratio.studentId.toString()] = ratio.ratio;
    totalRatio += ratio.ratio;
  }

  for (const studentId in result) {
    const ratio = ratioMap[studentId] || 0;
    const amount = Math.round(item.amount * (ratio / totalRatio));
    const percentage = (ratio / totalRatio) * 100;

    result[studentId].items.push({
      type: item.type,
      description: item.description,
      originalAmount: item.amount,
      splitMethod: "custom",
      ratio: ratio,
      amount: amount,
      percentage: percentage
    });

    result[studentId].subTotal += amount;
  }
};

// Thêm sinh viên vào cấu hình chia tiền
roomBillingSplitSchema.methods.addStudent = async function(studentId, percentage = null) {
  const activeCount = this.studentShares.filter(s => s.isActive).length + 1;
  const defaultPercentage = 100 / activeCount;

  // Cập nhật phần trăm của các sinh viên cũ
  if (!percentage) {
    for (const share of this.studentShares) {
      if (share.isActive) {
        share.percentage = defaultPercentage;
      }
    }
  }

  this.studentShares.push({
    studentId,
    percentage: percentage || defaultPercentage,
    isPayer: true,
    joinedAt: new Date(),
    isActive: true
  });

  return this.save();
};

// Xóa sinh viên khỏi cấu hình
roomBillingSplitSchema.methods.removeStudent = async function(studentId) {
  const share = this.studentShares.find(
    s => s.studentId.toString() === studentId.toString() && s.isActive
  );

  if (!share) {
    throw new Error("Student not found in billing split");
  }

  share.isActive = false;
  share.leftAt = new Date();

  // Cập nhật lại phần trăm cho những người còn lại
  const remainingActive = this.studentShares.filter(s => s.isActive);
  const newPercentage = 100 / remainingActive.length;

  for (const remaining of remainingActive) {
    remaining.percentage = newPercentage;
  }

  return this.save();
};

// Cập nhật cấu hình chia tiền
roomBillingSplitSchema.methods.updateSplitConfig = async function(itemType, splitMethod, customRatios = null) {
  const existingConfig = this.splitConfigs.find(
    c => c.itemType === itemType
  );

  if (existingConfig) {
    existingConfig.splitMethod = splitMethod;
    if (customRatios) {
      existingConfig.customRatios = customRatios;
    }
    existingConfig.isActive = true;
  } else {
    this.splitConfigs.push({
      itemType,
      splitMethod,
      customRatios,
      isActive: true
    });
  }

  return this.save();
};

roomBillingSplitSchema.statics.findByRoom = function(roomId) {
  return this.findOne({ roomId, isActive: true })
    .populate("studentShares.studentId", "studentId userId")
    .populate({
      path: "studentShares.studentId",
      populate: {
        path: "userId",
        select: "fullName email"
      }
    })
    .populate("primaryPayerId", "studentId userId")
    .populate("createdBy", "fullName")
    .populate("updatedBy", "fullName");
};

roomBillingSplitSchema.statics.createForRoom = async function(roomId, contractId, studentIds, adminId, options = {}) {
  const existing = await this.findOne({ roomId, isActive: true });
  if (existing) {
    throw new Error("Billing split already exists for this room");
  }

  const studentCount = studentIds.length;
  const defaultPercentage = 100 / studentCount;

  const studentShares = studentIds.map((studentId, index) => ({
    studentId,
    percentage: defaultPercentage,
    isPayer: true,
    joinedAt: new Date(),
    isActive: true
  }));

  // Cấu hình mặc định
  const defaultConfigs = [
    { itemType: "room_rent", splitMethod: "equal" },
    { itemType: "electricity", splitMethod: "by_usage" },
    { itemType: "water", splitMethod: "by_usage" },
    { itemType: "internet", splitMethod: "equal" },
    { itemType: "cleaning", splitMethod: "equal" },
    { itemType: "security", splitMethod: "equal" },
    { itemType: "parking", splitMethod: "assigned" },
    { itemType: "laundry", splitMethod: "assigned" },
    { itemType: "laundry_normal", splitMethod: "assigned" },
    { itemType: "laundry_express", splitMethod: "assigned" },
    { itemType: "laundry_steam", splitMethod: "assigned" },
    { itemType: "laundry_delivery", splitMethod: "assigned" }
  ];

  const billingSplit = new this({
    roomId,
    contractId,
    studentShares,
    splitConfigs: defaultConfigs,
    defaultSplitMethod: options.defaultSplitMethod || "equal",
    utilitiesSplitByPerson: options.utilitiesSplitByPerson !== false,
    autoSplitInvoice: options.autoSplitInvoice !== false,
    primaryPayerId: options.primaryPayerId || null,
    notes: options.notes || null,
    isActive: true,
    createdBy: adminId
  });

  await billingSplit.save();
  return billingSplit;
};

export default mongoose.model("RoomBillingSplit", roomBillingSplitSchema);
