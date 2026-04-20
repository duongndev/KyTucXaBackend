import Building from "../models/building/building.model.js";
import Room from "../models/building/room.model.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  createdResponse,
  notFoundResponse
} from "../utils/response.js";
import expressAsyncHandler from "express-async-handler";

export const getAllBuildings = expressAsyncHandler(async (req, res) => {
  const { status, buildingType, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (buildingType) filter.buildingType = buildingType;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [buildings, total] = await Promise.all([
    Building.find(filter)
      .sort({ buildingCode: 1 })
      .skip(skip)
      .limit(limitNum),
    Building.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Buildings retrieved successfully", {
    buildings,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems: total,
      itemsPerPage: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    }
  });
});

export const getBuildingById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const building = await Building.findById(id);
  if (!building) {
    return notFoundResponse(res, "Building not found");
  }

  successResponse(res, "Building retrieved successfully", { building });
});

export const createBuilding = expressAsyncHandler(async (req, res) => {
  const { buildingCode, buildingName, buildingType, totalFloors, address, description, amenities } = req.body;

  if (!buildingCode || !buildingName || !buildingType || !totalFloors) {
    return badRequestResponse(res, "buildingCode, buildingName, buildingType, and totalFloors are required");
  }

  const existingBuilding = await Building.findOne({
    $or: [{ buildingCode: buildingCode.toUpperCase() }, { buildingName }]
  });

  if (existingBuilding) {
    return badRequestResponse(res, "Building with this code or name already exists");
  }

  const building = new Building({
    buildingCode: buildingCode.toUpperCase(),
    buildingName,
    buildingType,
    totalFloors,
    address,
    description,
    amenities: amenities || [],
    stats: {
      totalRooms: 0,
      availableRooms: 0,
      occupiedRooms: 0,
      totalCapacity: 0,
      currentOccupancy: 0
    }
  });

  await building.save();
  createdResponse(res, "Building created successfully", { building });
});

export const updateBuilding = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { buildingName, buildingType, totalFloors, address, description, status, amenities } = req.body;

  const building = await Building.findById(id);
  if (!building) {
    return notFoundResponse(res, "Building not found");
  }

  if (buildingName) building.buildingName = buildingName;
  if (buildingType) building.buildingType = buildingType;
  if (totalFloors) building.totalFloors = totalFloors;
  if (address !== undefined) building.address = address;
  if (description !== undefined) building.description = description;
  if (status) building.status = status;
  if (amenities) building.amenities = amenities;

  await building.save();
  successResponse(res, "Building updated successfully", { building });
});

export const deleteBuilding = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const building = await Building.findById(id);
  if (!building) {
    return notFoundResponse(res, "Building not found");
  }

  const roomCount = await Room.countDocuments({ buildingId: id });
  if (roomCount > 0) {
    return badRequestResponse(res, "Cannot delete building with existing rooms");
  }

  await Building.findByIdAndDelete(id);
  successResponse(res, "Building deleted successfully");
});

export const getBuildingStats = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const building = await Building.findById(id);
  if (!building) {
    return notFoundResponse(res, "Building not found");
  }

  const roomStats = await Room.aggregate([
    { $match: { buildingId: building._id } },
    {
      $group: {
        _id: "$roomStatus",
        count: { $sum: 1 },
        capacity: { $sum: "$capacity" },
        occupancy: { $sum: "$currentOccupancy" }
      }
    }
  ]);

  const floorStats = await Room.aggregate([
    { $match: { buildingId: building._id } },
    {
      $group: {
        _id: "$floor",
        totalRooms: { $sum: 1 },
        availableRooms: {
          $sum: { $cond: [{ $eq: ["$roomStatus", "available"] }, 1, 0] }
        },
        occupiedRooms: {
          $sum: { $cond: [{ $eq: ["$roomStatus", "full"] }, 1, 0] }
        },
        capacity: { $sum: "$capacity" },
        occupancy: { $sum: "$currentOccupancy" }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const stats = {
    building: {
      code: building.buildingCode,
      name: building.buildingName,
      type: building.buildingType,
      totalFloors: building.totalFloors
    },
    overall: {
      totalRooms: building.stats.totalRooms,
      availableRooms: building.stats.availableRooms,
      occupiedRooms: building.stats.occupiedRooms,
      maintenanceRooms: roomStats.find(s => s._id === "maintenance")?.count || 0,
      totalCapacity: building.stats.totalCapacity,
      currentOccupancy: building.stats.currentOccupancy,
      occupancyRate: building.stats.totalCapacity > 0
        ? Math.round((building.stats.currentOccupancy / building.stats.totalCapacity) * 100)
        : 0
    },
    byStatus: roomStats.reduce((acc, stat) => {
      acc[stat._id] = {
        count: stat.count,
        capacity: stat.capacity,
        occupancy: stat.occupancy
      };
      return acc;
    }, {}),
    byFloor: floorStats.map(f => ({
      floor: f._id,
      totalRooms: f.totalRooms,
      availableRooms: f.availableRooms,
      occupiedRooms: f.occupiedRooms,
      capacity: f.capacity,
      occupancy: f.occupancy
    }))
  };

  successResponse(res, "Building statistics retrieved successfully", stats);
});

export const syncBuildingStats = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const building = await Building.findById(id);
  if (!building) {
    return notFoundResponse(res, "Building not found");
  }

  const stats = await Room.aggregate([
    { $match: { buildingId: building._id } },
    {
      $group: {
        _id: null,
        totalRooms: { $sum: 1 },
        availableRooms: {
          $sum: { $cond: [{ $eq: ["$roomStatus", "available"] }, 1, 0] }
        },
        occupiedRooms: {
          $sum: { $cond: [{ $eq: ["$roomStatus", "full"] }, 1, 0] }
        },
        totalCapacity: { $sum: "$capacity" },
        currentOccupancy: { $sum: "$currentOccupancy" }
      }
    }
  ]);

  const result = stats[0] || {
    totalRooms: 0,
    availableRooms: 0,
    occupiedRooms: 0,
    totalCapacity: 0,
    currentOccupancy: 0
  };

  building.stats = {
    totalRooms: result.totalRooms,
    availableRooms: result.availableRooms,
    occupiedRooms: result.occupiedRooms,
    totalCapacity: result.totalCapacity,
    currentOccupancy: result.currentOccupancy
  };

  await building.save();

  successResponse(res, "Building stats synchronized successfully", {
    building,
    stats: building.stats
  });
});
