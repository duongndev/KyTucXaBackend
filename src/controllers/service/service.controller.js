import ServiceRate from "../../models/contract/serviceRate.model.js";
import RoomService from "../../models/contract/roomService.model.js";
import Room from "../../models/building/room.model.js";
import Contract from "../../models/contract/contract.model.js";
import Student from "../../models/user/student.model.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  notFoundResponse,
  createdResponse
} from "../../utils/response.js";
import expressAsyncHandler from "express-async-handler";

export const getAllServices = expressAsyncHandler(async (req, res) => {
  const { type, isActive, isOptional, applicableTo, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (isOptional !== undefined) filter.isOptional = isOptional === "true";
  if (applicableTo) filter.applicableTo = applicableTo;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [services, total] = await Promise.all([
    ServiceRate.find(filter)
      .populate("createdBy", "fullName")
      .populate("updatedBy", "fullName")
      .sort({ type: 1, serviceCode: 1 })
      .skip(skip)
      .limit(limitNum),
    ServiceRate.countDocuments(filter)
  ]);

  successResponse(res, "Services retrieved", {
    services,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total
    }
  });
});

export const getServiceById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const service = await ServiceRate.findById(id)
    .populate("createdBy", "fullName")
    .populate("updatedBy", "fullName");

  if (!service) {
    return notFoundResponse(res, "Service not found");
  }

  successResponse(res, "Service retrieved", { service });
});

export const createService = expressAsyncHandler(async (req, res) => {
  const {
    serviceCode,
    serviceName,
    type,
    billingType,
    basePrice,
    unit,
    isRequired,
    isOptional,
    applicableTo,
    description
  } = req.body;

  if (!serviceCode || !serviceName || !type || basePrice === undefined) {
    return badRequestResponse(res, "Missing required fields");
  }

  const existing = await ServiceRate.findOne({
    $or: [{ serviceCode: serviceCode.toUpperCase() }, { serviceName }]
  });

  if (existing) {
    return badRequestResponse(res, "Service code or name already exists");
  }

  const service = await ServiceRate.create({
    serviceCode: serviceCode.toUpperCase(),
    serviceName,
    type,
    billingType: billingType || "fixed",
    basePrice,
    unit: unit || "tháng",
    isRequired: isRequired !== undefined ? isRequired : true,
    isOptional: isOptional !== undefined ? isOptional : false,
    applicableTo: applicableTo || "all",
    description,
    createdBy: req.user._id
  });

  createdResponse(res, "Service created", { service });
});

export const updateService = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const service = await ServiceRate.findById(id);
  if (!service) {
    return notFoundResponse(res, "Service not found");
  }

  delete updateData.serviceCode;
  delete updateData.createdBy;

  updateData.updatedBy = req.user._id;

  Object.assign(service, updateData);
  await service.save();

  successResponse(res, "Service updated", { service });
});

export const deleteService = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const service = await ServiceRate.findById(id);
  if (!service) {
    return notFoundResponse(res, "Service not found");
  }

  const roomServicesUsing = await RoomService.countDocuments({
    "services.serviceId": id,
    "services.isActive": true
  });

  if (roomServicesUsing > 0) {
    return badRequestResponse(res, `Cannot delete: ${roomServicesUsing} rooms are using this service`);
  }

  await ServiceRate.findByIdAndDelete(id);
  successResponse(res, "Service deleted");
});

export const getActiveServices = expressAsyncHandler(async (req, res) => {
  const services = await ServiceRate.getActiveServices();

  const grouped = services.reduce((acc, service) => {
    if (!acc[service.type]) acc[service.type] = [];
    acc[service.type].push(service);
    return acc;
  }, {});

  successResponse(res, "Active services", {
    services,
    grouped,
    required: services.filter(s => s.isRequired),
    optional: services.filter(s => s.isOptional)
  });
});

export const calculateServiceCost = expressAsyncHandler(async (req, res) => {
  const { serviceId, occupants = 1, usage = 1 } = req.body;

  const service = await ServiceRate.findById(serviceId);
  if (!service) {
    return notFoundResponse(res, "Service not found");
  }

  const cost = service.calculateCost(occupants, usage);

  successResponse(res, "Cost calculated", {
    service: {
      code: service.serviceCode,
      name: service.serviceName,
      billingType: service.billingType,
      basePrice: service.basePrice,
      unit: service.unit
    },
    calculation: {
      occupants,
      usage,
      totalCost: cost
    }
  });
});

export const initDefaultServices = expressAsyncHandler(async (req, res) => {
  const results = await ServiceRate.createDefaultServices(req.user._id);

  successResponse(res, "Default services initialized", {
    created: results.created.length,
    existing: results.existing.length,
    services: results.created
  });
});

export const getRoomServices = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;

  const roomService = await RoomService.findByRoom(roomId);
  if (!roomService) {
    return notFoundResponse(res, "No service subscription found for this room");
  }

  const room = await Room.findById(roomId).populate("assignedStudents.studentId");
  const occupants = room.currentOccupancy || 1;

  const calculation = roomService.calculateMonthlyServices(occupants);

  successResponse(res, "Room services", {
    roomService,
    currentOccupancy: occupants,
    monthlyCalculation: calculation
  });
});

export const subscribeService = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { serviceId, usageData } = req.body;

  const roomService = await RoomService.findByRoom(roomId);
  if (!roomService) {
    return notFoundResponse(res, "Room service subscription not found");
  }

  const serviceRate = await ServiceRate.findById(serviceId);
  if (!serviceRate) {
    return notFoundResponse(res, "Service not found");
  }

  if (!serviceRate.isActive) {
    return badRequestResponse(res, "This service is not active");
  }

  await roomService.subscribeService(serviceRate, usageData);

  successResponse(res, "Service subscribed", {
    roomService: await RoomService.findByRoom(roomId)
  });
});

export const unsubscribeService = expressAsyncHandler(async (req, res) => {
  const { roomId, serviceCode } = req.params;

  const roomService = await RoomService.findByRoom(roomId);
  if (!roomService) {
    return notFoundResponse(res, "Room service subscription not found");
  }

  await roomService.unsubscribeService(serviceCode);

  successResponse(res, "Service unsubscribed", {
    roomService: await RoomService.findByRoom(roomId)
  });
});

export const getMyServices = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Student profile not found");
  }

  const roomServices = await RoomService.findByStudent(student._id);

  const currentContract = await Contract.findOne({
    studentId: student._id,
    status: { $in: ["active", "pending_signature"] }
  });

  let currentServices = null;
  if (currentContract) {
    currentServices = await RoomService.findByContract(currentContract._id);
  }

  successResponse(res, "My services", {
    history: roomServices,
    current: currentServices
  });
});

export const createRoomService = expressAsyncHandler(async (req, res) => {
  const { contractId } = req.body;

  const contract = await Contract.findById(contractId)
    .populate("roomId", "currentOccupancy")
    .populate("studentId", "studentId");

  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  const existing = await RoomService.findOne({ contractId });
  if (existing) {
    return badRequestResponse(res, "RoomService already exists for this contract");
  }

  const roomService = await RoomService.createForContract(
    contractId,
    contract.roomId._id,
    contract.studentId._id,
    req.user._id
  );

  createdResponse(res, "Room service created", {
    roomService: await RoomService.findById(roomService._id)
      .populate("services.serviceId")
  });
});

// ==================== LAUNDRY SERVICE CALCULATION ====================

export const calculateLaundryCost = expressAsyncHandler(async (req, res) => {
  const { serviceCode, weight, includeDelivery, deliveryCount = 1 } = req.body;

  if (!serviceCode || !weight || weight <= 0) {
    return badRequestResponse(res, "Service code and valid weight are required");
  }

  // Validate service code
  const validLaundryCodes = ["LAUNDRY_NORMAL", "LAUNDRY_EXPRESS", "LAUNDRY_STEAM"];
  if (!validLaundryCodes.includes(serviceCode)) {
    return badRequestResponse(res, `Invalid laundry service code. Must be one of: ${validLaundryCodes.join(", ")}`);
  }

  // Get laundry service
  const laundryService = await ServiceRate.findOne({
    serviceCode,
    isActive: true
  });

  if (!laundryService) {
    return notFoundResponse(res, "Laundry service not found");
  }

  // Calculate costs
  const laundryCost = laundryService.basePrice * weight;
  let deliveryCost = 0;

  if (includeDelivery) {
    const deliveryService = await ServiceRate.findOne({
      serviceCode: "LAUNDRY_DELIVERY",
      isActive: true
    });
    if (deliveryService) {
      deliveryCost = deliveryService.basePrice * deliveryCount;
    }
  }

  const totalCost = laundryCost + deliveryCost;

  successResponse(res, "Laundry cost calculated", {
    service: {
      code: laundryService.serviceCode,
      name: laundryService.serviceName,
      pricePerKg: laundryService.basePrice,
      processingTime: laundryService.metadata?.processingTime || "N/A",
      features: laundryService.metadata?.features || []
    },
    calculation: {
      weight,
      laundryCost,
      includeDelivery,
      deliveryCost,
      deliveryCount: includeDelivery ? deliveryCount : 0,
      totalCost
    }
  });
});

export const getLaundryServices = expressAsyncHandler(async (req, res) => {
  const laundryServices = await ServiceRate.find({
    type: "laundry",
    isActive: true
  }).sort({ basePrice: 1 });

  const formatted = laundryServices.map(service => ({
    code: service.serviceCode,
    name: service.serviceName,
    price: service.basePrice,
    unit: service.unit,
    billingType: service.billingType,
    description: service.description,
    metadata: service.metadata || {}
  }));

  successResponse(res, "Laundry services retrieved", {
    services: formatted
  });
});
