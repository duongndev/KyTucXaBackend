import mongoose from "mongoose";

const subscribedServiceSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceRate",
    required: true
  },

  serviceCode: {
    type: String,
    required: true
  },

  serviceName: {
    type: String,
    required: true
  },

  billingType: {
    type: String,
    required: true
  },

  basePrice: {
    type: Number,
    required: true
  },

  unit: {
    type: String,
    required: true
  },

  subscribedAt: {
    type: Date,
    default: Date.now
  },

  unsubscribedAt: {
    type: Date,
    default: null
  },

  isActive: {
    type: Boolean,
    default: true
  },

  usageTracking: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
    description: "Lưu thông tin sử dụng (cho dịch vụ theo lượt)"
  },

  notes: {
    type: String,
    default: null
  }

}, { _id: true });

const roomServiceSchema = new mongoose.Schema({
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

  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },

  services: [subscribedServiceSchema],

  totalMonthlyServices: {
    type: Number,
    default: 0,
    description: "Tổng phí dịch vụ cố định hàng tháng"
  },

  isActive: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true,
  versionKey: false
});

roomServiceSchema.index({ studentId: 1 });
roomServiceSchema.index({ contractId: 1 });
roomServiceSchema.index({ isActive: 1 });

roomServiceSchema.methods.subscribeService = async function(serviceRate, usageData = null) {
  const existingService = this.services.find(
    s => s.serviceCode === serviceRate.serviceCode && s.isActive
  );

  if (existingService) {
    throw new Error(`Service ${serviceRate.serviceName} is already subscribed`);
  }

  const newService = {
    serviceId: serviceRate._id,
    serviceCode: serviceRate.serviceCode,
    serviceName: serviceRate.serviceName,
    billingType: serviceRate.billingType,
    basePrice: serviceRate.basePrice,
    unit: serviceRate.unit,
    subscribedAt: new Date(),
    isActive: true,
    usageTracking: usageData
  };

  this.services.push(newService);

  if (serviceRate.billingType === "fixed" || serviceRate.billingType === "per_room") {
    this.totalMonthlyServices += serviceRate.basePrice;
  }

  this.updatedAt = new Date();
  return this.save();
};

roomServiceSchema.methods.unsubscribeService = async function(serviceCode) {
  const service = this.services.find(
    s => s.serviceCode === serviceCode && s.isActive
  );

  if (!service) {
    throw new Error(`Active service ${serviceCode} not found`);
  }

  service.isActive = false;
  service.unsubscribedAt = new Date();

  if (service.billingType === "fixed" || service.billingType === "per_room") {
    this.totalMonthlyServices -= service.basePrice;
  }

  this.updatedAt = new Date();
  return this.save();
};

roomServiceSchema.methods.calculateMonthlyServices = function(occupants = 1) {
  let total = 0;
  const breakdown = [];

  for (const service of this.services.filter(s => s.isActive)) {
    let amount = 0;

    switch (service.billingType) {
      case "fixed":
      case "per_room":
        amount = service.basePrice;
        break;
      case "per_person":
        amount = service.basePrice * occupants;
        break;
      default:
        amount = service.basePrice;
    }

    total += amount;
    breakdown.push({
      serviceCode: service.serviceCode,
      serviceName: service.serviceName,
      billingType: service.billingType,
      basePrice: service.basePrice,
      quantity: service.billingType === "per_person" ? occupants : 1,
      amount
    });
  }

  return { total, breakdown };
};

roomServiceSchema.methods.getInvoiceItems = function(occupants = 1, year, month) {
  const items = [];

  for (const service of this.services.filter(s => s.isActive)) {
    let amount = 0;
    let quantity = 1;

    switch (service.billingType) {
      case "fixed":
      case "per_room":
        amount = service.basePrice;
        break;
      case "per_person":
        amount = service.basePrice * occupants;
        quantity = occupants;
        break;
      default:
        amount = service.basePrice;
    }

    items.push({
      type: service.serviceCode.toLowerCase().replace(/_/g, ""),
      amount,
      description: `${service.serviceName} - ${month}/${year}`,
      quantity,
      unitPrice: service.basePrice,
      serviceCode: service.serviceCode
    });
  }

  return items;
};

roomServiceSchema.statics.findByRoom = function(roomId) {
  return this.findOne({ roomId, isActive: true })
    .populate("roomId", "roomCode currentOccupancy")
    .populate("services.serviceId");
};

roomServiceSchema.statics.findByContract = function(contractId) {
  return this.findOne({ contractId, isActive: true })
    .populate("services.serviceId");
};

roomServiceSchema.statics.findByStudent = function(studentId) {
  return this.find({ studentId, isActive: true })
    .populate("roomId", "roomCode")
    .populate("services.serviceId");
};

roomServiceSchema.statics.createForContract = async function(contractId, roomId, studentId, adminId) {
  const ServiceRate = mongoose.model("ServiceRate");

  const existing = await this.findOne({ contractId });
  if (existing) {
    throw new Error("RoomService already exists for this contract");
  }

  const requiredServices = await ServiceRate.getRequiredServices();

  const services = requiredServices.map(service => ({
    serviceId: service._id,
    serviceCode: service.serviceCode,
    serviceName: service.serviceName,
    billingType: service.billingType,
    basePrice: service.basePrice,
    unit: service.unit,
    subscribedAt: new Date(),
    isActive: true
  }));

  const totalMonthlyServices = services.reduce((sum, s) => {
    if (s.billingType === "fixed" || s.billingType === "per_room") {
      return sum + s.basePrice;
    }
    return sum;
  }, 0);

  const roomService = new this({
    roomId,
    contractId,
    studentId,
    services,
    totalMonthlyServices,
    isActive: true
  });

  await roomService.save();
  return roomService;
};

export default mongoose.model("RoomService", roomServiceSchema);
