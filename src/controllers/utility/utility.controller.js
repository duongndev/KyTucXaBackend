import MeterReading from "../../models/contract/meterReading.model.js";
import UtilityRate from "../../models/contract/utilityRate.model.js";
import Room from "../../models/building/room.model.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  notFoundResponse,
  createdResponse
} from "../../utils/response.js";
import expressAsyncHandler from "express-async-handler";

export const getMeterReadings = expressAsyncHandler(async (req, res) => {
  const { roomId, year, month, status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (roomId) filter.roomId = roomId;
  if (year) filter.year = parseInt(year);
  if (month) filter.month = month;
  if (status) filter.status = status;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [readings, total] = await Promise.all([
    MeterReading.find(filter)
      .populate("roomId", "roomCode roomNumber buildingId")
      .populate({
        path: "roomId",
        populate: {
          path: "buildingId",
          select: "buildingCode buildingName"
        }
      })
      .populate("readBy", "fullName")
      .populate("verifiedBy", "fullName")
      .sort({ year: -1, month: -1 })
      .skip(skip)
      .limit(limitNum),
    MeterReading.countDocuments(filter)
  ]);

  successResponse(res, "Meter readings retrieved", {
    readings,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total
    }
  });
});

export const getMeterReadingById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const reading = await MeterReading.findById(id)
    .populate("roomId", "roomCode roomNumber")
    .populate("readBy", "fullName")
    .populate("verifiedBy", "fullName");

  if (!reading) {
    return notFoundResponse(res, "Meter reading not found");
  }

  successResponse(res, "Meter reading retrieved", { reading });
});

export const createMeterReading = expressAsyncHandler(async (req, res) => {
  const {
    roomId,
    month,
    electricity,
    water,
    notes,
    isEstimated = false
  } = req.body;

  if (!roomId || !month || !electricity || !water) {
    return badRequestResponse(res, "Missing required fields");
  }

  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(month)) {
    return badRequestResponse(res, "Month must be in format YYYY-MM");
  }

  const room = await Room.findById(roomId);
  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  const [year, monthNum] = month.split("-").map(Number);

  const existingReading = await MeterReading.findOne({ roomId, month });
  if (existingReading) {
    return badRequestResponse(res, "Meter reading already exists for this room and month", {
      existingId: existingReading._id
    });
  }

  const lastReading = await MeterReading.getLastReading(roomId);

  const readingData = {
    roomId,
    month,
    year,
    electricity: {
      previous: electricity.previous ?? lastReading?.electricity?.current ?? 0,
      current: electricity.current,
      meterNumber: electricity.meterNumber,
      imageUrl: electricity.imageUrl,
      isEstimated
    },
    water: {
      previous: water.previous ?? lastReading?.water?.current ?? 0,
      current: water.current,
      meterNumber: water.meterNumber,
      imageUrl: water.imageUrl,
      isEstimated
    },
    readBy: req.user._id,
    notes
  };

  const reading = await MeterReading.create(readingData);

  createdResponse(res, "Meter reading created", {
    reading: await MeterReading.findById(reading._id)
      .populate("roomId", "roomCode")
      .populate("readBy", "fullName")
  });
});

export const updateMeterReading = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { electricity, water, notes } = req.body;

  const reading = await MeterReading.findById(id);
  if (!reading) {
    return notFoundResponse(res, "Meter reading not found");
  }

  if (reading.status === "billed") {
    return badRequestResponse(res, "Cannot update reading that has been billed");
  }

  if (electricity) {
    if (electricity.current) reading.electricity.current = electricity.current;
    if (electricity.imageUrl) reading.electricity.imageUrl = electricity.imageUrl;
  }

  if (water) {
    if (water.current) reading.water.current = water.current;
    if (water.imageUrl) reading.water.imageUrl = water.imageUrl;
  }

  if (notes) reading.notes = notes;

  reading.electricity.usage = reading.electricity.current - reading.electricity.previous;
  reading.water.usage = reading.water.current - reading.water.previous;

  await reading.save();

  successResponse(res, "Meter reading updated", { reading });
});

export const verifyMeterReading = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const reading = await MeterReading.findById(id);
  if (!reading) {
    return notFoundResponse(res, "Meter reading not found");
  }

  if (reading.status === "billed") {
    return badRequestResponse(res, "Reading already billed");
  }

  await reading.verify(req.user._id);

  successResponse(res, "Meter reading verified", { reading });
});

export const deleteMeterReading = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const reading = await MeterReading.findById(id);
  if (!reading) {
    return notFoundResponse(res, "Meter reading not found");
  }

  if (reading.status === "billed") {
    return badRequestResponse(res, "Cannot delete billed reading");
  }

  await MeterReading.findByIdAndDelete(id);

  successResponse(res, "Meter reading deleted");
});

export const getReadingsByMonth = expressAsyncHandler(async (req, res) => {
  const { year, month } = req.query;

  if (!year || !month) {
    return badRequestResponse(res, "Year and month are required");
  }

  const readings = await MeterReading.findByMonth(parseInt(year), parseInt(month));

  const stats = await MeterReading.getMonthlyStats(parseInt(year), parseInt(month));

  successResponse(res, "Monthly readings retrieved", {
    readings,
    stats: stats[0] || {
      totalElectricityUsage: 0,
      totalWaterUsage: 0,
      avgElectricityUsage: 0,
      avgWaterUsage: 0,
      count: 0
    }
  });
});

export const getRoomReadingHistory = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { limit = 12 } = req.query;

  const readings = await MeterReading.findByRoom(roomId, { limit: parseInt(limit) });

  successResponse(res, "Room reading history", { readings });
});

export const getUtilityRates = expressAsyncHandler(async (req, res) => {
  const { type, isActive } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive === "true";

  const rates = await UtilityRate.find(filter)
    .populate("createdBy", "fullName")
    .populate("updatedBy", "fullName")
    .sort({ effectiveFrom: -1 });

  successResponse(res, "Utility rates retrieved", { rates });
});

export const getActiveRates = expressAsyncHandler(async (req, res) => {
  const elecRate = await UtilityRate.getElectricityRate();
  const waterRate = await UtilityRate.getWaterRate();

  successResponse(res, "Active utility rates", {
    electricity: elecRate,
    water: waterRate
  });
});

export const createUtilityRate = expressAsyncHandler(async (req, res) => {
  const {
    type,
    name,
    effectiveFrom,
    effectiveTo,
    tiers,
    unitPrice,
    minCharge,
    vatRate,
    notes
  } = req.body;

  if (!type || !name || !effectiveFrom) {
    return badRequestResponse(res, "Missing required fields");
  }

  if (type === "electricity" && (!tiers || tiers.length === 0)) {
    return badRequestResponse(res, "Electricity rate requires tiers");
  }

  if (type === "water" && !unitPrice) {
    return badRequestResponse(res, "Water rate requires unitPrice");
  }

  const rate = await UtilityRate.create({
    type,
    name,
    effectiveFrom: new Date(effectiveFrom),
    effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
    tiers: type === "electricity" ? tiers : null,
    unitPrice: type === "water" ? unitPrice : null,
    minCharge: minCharge || 0,
    vatRate: vatRate || 0,
    notes,
    createdBy: req.user._id
  });

  createdResponse(res, "Utility rate created", { rate });
});

export const updateUtilityRate = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const rate = await UtilityRate.findById(id);
  if (!rate) {
    return notFoundResponse(res, "Utility rate not found");
  }

  delete updateData.type;
  delete updateData.createdBy;

  updateData.updatedBy = req.user._id;

  Object.assign(rate, updateData);
  await rate.save();

  successResponse(res, "Utility rate updated", { rate });
});

export const calculateUtilityCost = expressAsyncHandler(async (req, res) => {
  const { electricityUsage, waterUsage } = req.body;

  const elecRate = await UtilityRate.getElectricityRate();
  const waterRate = await UtilityRate.getWaterRate();

  if (!elecRate || !waterRate) {
    return badRequestResponse(res, "Utility rates not configured");
  }

  const electricityCost = elecRate.calculateElectricityCost(electricityUsage || 0);
  const waterCost = waterRate.calculateWaterCost(waterUsage || 0);

  const electricityBreakdown = elecRate.getTierBreakdown(electricityUsage || 0);

  successResponse(res, "Utility cost calculated", {
    electricity: {
      usage: electricityUsage,
      cost: electricityCost,
      breakdown: electricityBreakdown
    },
    water: {
      usage: waterUsage,
      cost: waterCost,
      unitPrice: waterRate.unitPrice
    },
    total: electricityCost + waterCost
  });
});

export const initDefaultRates = expressAsyncHandler(async (req, res) => {
  const results = await UtilityRate.createDefaultRates(req.user._id);

  successResponse(res, "Default rates initialized", {
    created: results,
    electricity: results.electricity ? "Created" : "Already exists",
    water: results.water ? "Created" : "Already exists"
  });
});
