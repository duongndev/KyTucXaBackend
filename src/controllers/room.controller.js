import Room from "../models/building/room.model.js";
import Building from "../models/building/building.model.js";
import Student from "../models/user/student.model.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  createdResponse,
  notFoundResponse
} from "../utils/response.js";
import expressAsyncHandler from "express-async-handler";

const generateRoomCode = (buildingCode, roomNumber) => {
  return `${buildingCode}-${roomNumber}`;
};

const generateRoomNumber = (floor, roomIndex) => {
  const floorPrefix = floor.toString();
  const roomSuffix = roomIndex.toString().padStart(2, "0");
  return `${floorPrefix}${roomSuffix}`;
};

const parseFloorFromRoomNumber = (roomNumber) => {
  if (!roomNumber || roomNumber.length < 3) return null;
  const floorStr = roomNumber.substring(0, roomNumber.length - 2);
  const floor = parseInt(floorStr);
  return isNaN(floor) ? null : floor;
};

export const getAllRooms = expressAsyncHandler(async (req, res) => {
  const {
    buildingId,
    floor,
    roomStatus,
    gender,
    roomType,
    page = 1,
    limit = 20,
    sortBy = "roomCode",
    order = "asc"
  } = req.query;

  const filter = {};
  if (buildingId) filter.buildingId = buildingId;
  if (floor) filter.floor = parseInt(floor);
  if (roomStatus) filter.roomStatus = roomStatus;
  if (gender) filter.gender = gender;
  if (roomType) filter.roomType = roomType;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sortOrder = order === "desc" ? -1 : 1;

  const [rooms, total] = await Promise.all([
    Room.find(filter)
      .populate("buildingId", "buildingCode buildingName buildingType")
      .populate("assignedStudents.studentId", "studentId userId")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum),
    Room.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Rooms retrieved successfully", {
    rooms,
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

export const getRoomById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const room = await Room.findById(id)
    .populate("buildingId", "buildingCode buildingName buildingType")
    .populate({
      path: "assignedStudents.studentId",
      select: "studentId userId currentContract",
      populate: {
        path: "userId",
        select: "fullName phoneNumber email gender"
      }
    });

  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  successResponse(res, "Room retrieved successfully", { room });
});

export const getRoomByCode = expressAsyncHandler(async (req, res) => {
  const { roomCode } = req.params;

  const room = await Room.findOne({ roomCode: roomCode.toUpperCase() })
    .populate("buildingId", "buildingCode buildingName buildingType")
    .populate({
      path: "assignedStudents.studentId",
      select: "studentId userId currentContract",
      populate: {
        path: "userId",
        select: "fullName phoneNumber email gender"
      }
    });

  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  successResponse(res, "Room retrieved successfully", { room });
});

export const createRoom = expressAsyncHandler(async (req, res) => {
  const {
    buildingId,
    roomNumber,
    roomType,
    capacity,
    gender,
    area,
    pricePerMonth,
    facilities,
    notes
  } = req.body;

  if (!buildingId || !roomNumber || !roomType || !capacity || !gender) {
    return badRequestResponse(res, "buildingId, roomNumber, roomType, capacity, and gender are required");
  }

  const building = await Building.findById(buildingId);
  if (!building) {
    return notFoundResponse(res, "Building not found");
  }

  const floor = parseFloorFromRoomNumber(roomNumber);
  if (floor === null || floor > building.totalFloors) {
    return badRequestResponse(res, "Invalid room number or floor exceeds building total floors");
  }

  const roomCode = generateRoomCode(building.buildingCode, roomNumber);

  const existingRoom = await Room.findOne({
    $or: [
      { buildingId, roomNumber },
      { roomCode }
    ]
  });

  if (existingRoom) {
    return badRequestResponse(res, "Room with this number or code already exists");
  }

  const room = new Room({
    buildingId,
    roomNumber,
    floor,
    roomCode,
    roomType,
    capacity,
    gender,
    area: area || 0,
    pricePerMonth: pricePerMonth || 0,
    facilities: facilities || [],
    currentOccupancy: 0,
    assignedStudents: [],
    notes
  });

  await room.save();

  await Building.findByIdAndUpdate(buildingId, {
    $inc: {
      "stats.totalRooms": 1,
      "stats.availableRooms": 1,
      "stats.totalCapacity": capacity
    }
  });

  const populatedRoom = await Room.findById(room._id)
    .populate("buildingId", "buildingCode buildingName buildingType");

  createdResponse(res, "Room created successfully", { room: populatedRoom });
});

export const updateRoom = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { roomType, capacity, area, pricePerMonth, facilities, notes, roomStatus } = req.body;

  const room = await Room.findById(id);
  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  const oldCapacity = room.capacity;

  if (roomType) room.roomType = roomType;
  if (capacity) room.capacity = capacity;
  if (area !== undefined) room.area = area;
  if (pricePerMonth !== undefined) room.pricePerMonth = pricePerMonth;
  if (facilities) room.facilities = facilities;
  if (notes !== undefined) room.notes = notes;
  if (roomStatus) room.roomStatus = roomStatus;

  await room.save();

  if (capacity && capacity !== oldCapacity) {
    const capacityDiff = capacity - oldCapacity;
    await Building.findByIdAndUpdate(room.buildingId, {
      $inc: { "stats.totalCapacity": capacityDiff }
    });
  }

  const populatedRoom = await Room.findById(room._id)
    .populate("buildingId", "buildingCode buildingName buildingType");

  successResponse(res, "Room updated successfully", { room: populatedRoom });
});

export const deleteRoom = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const room = await Room.findById(id);
  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  if (room.currentOccupancy > 0) {
    return badRequestResponse(res, "Cannot delete room with assigned students");
  }

  await Room.findByIdAndDelete(id);

  await Building.findByIdAndUpdate(room.buildingId, {
    $inc: {
      "stats.totalRooms": -1,
      "stats.availableRooms": room.roomStatus === "available" ? -1 : 0,
      "stats.totalCapacity": -room.capacity
    }
  });

  successResponse(res, "Room deleted successfully");
});

export const getAvailableRooms = expressAsyncHandler(async (req, res) => {
  const { buildingId, gender, roomType, page = 1, limit = 20 } = req.query;

  const filter = { roomStatus: "available" };
  if (buildingId) filter.buildingId = buildingId;
  if (gender) filter.gender = gender;
  if (roomType) filter.roomType = roomType;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [rooms, total] = await Promise.all([
    Room.find(filter)
      .populate("buildingId", "buildingCode buildingName buildingType")
      .sort({ roomCode: 1 })
      .skip(skip)
      .limit(limitNum),
    Room.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Available rooms retrieved successfully", {
    rooms,
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

export const getRoomsByBuilding = expressAsyncHandler(async (req, res) => {
  const { buildingId } = req.params;
  const { floor, roomStatus, page = 1, limit = 50 } = req.query;

  const filter = { buildingId };
  if (floor) filter.floor = parseInt(floor);
  if (roomStatus) filter.roomStatus = roomStatus;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [rooms, total] = await Promise.all([
    Room.find(filter)
      .populate("assignedStudents.studentId", "studentId userId")
      .sort({ floor: 1, roomNumber: 1 })
      .skip(skip)
      .limit(limitNum),
    Room.countDocuments(filter)
  ]);

  const groupedByFloor = rooms.reduce((acc, room) => {
    if (!acc[room.floor]) acc[room.floor] = [];
    acc[room.floor].push(room);
    return acc;
  }, {});

  successResponse(res, "Rooms by building retrieved successfully", {
    buildingId,
    floors: groupedByFloor,
    allRooms: rooms,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum
    }
  });
});

export const bulkCreateRooms = expressAsyncHandler(async (req, res) => {
  const { buildingId, rooms } = req.body;

  if (!buildingId || !Array.isArray(rooms) || rooms.length === 0) {
    return badRequestResponse(res, "buildingId and rooms array are required");
  }

  const building = await Building.findById(buildingId);
  if (!building) {
    return notFoundResponse(res, "Building not found");
  }

  const createdRooms = [];
  const errors = [];

  for (const roomData of rooms) {
    const { roomNumber, roomType, capacity, gender, area, pricePerMonth, facilities } = roomData;

    if (!roomNumber || !roomType || !capacity || !gender) {
      errors.push({ roomNumber, error: "Missing required fields" });
      continue;
    }

    const floor = parseFloorFromRoomNumber(roomNumber);
    if (floor === null || floor > building.totalFloors) {
      errors.push({ roomNumber, error: "Invalid room number or floor exceeds limit" });
      continue;
    }

    const roomCode = generateRoomCode(building.buildingCode, roomNumber);

    const existingRoom = await Room.findOne({
      $or: [{ buildingId, roomNumber }, { roomCode }]
    });

    if (existingRoom) {
      errors.push({ roomNumber, error: "Room already exists" });
      continue;
    }

    const room = new Room({
      buildingId,
      roomNumber,
      floor,
      roomCode,
      roomType,
      capacity,
      gender,
      area: area || 0,
      pricePerMonth: pricePerMonth || 0,
      facilities: facilities || [],
      currentOccupancy: 0,
      assignedStudents: []
    });

    await room.save();
    createdRooms.push(room);
  }

  if (createdRooms.length > 0) {
    const totalCapacity = createdRooms.reduce((sum, r) => sum + r.capacity, 0);
    await Building.findByIdAndUpdate(buildingId, {
      $inc: {
        "stats.totalRooms": createdRooms.length,
        "stats.availableRooms": createdRooms.length,
        "stats.totalCapacity": totalCapacity
      }
    });
  }

  successResponse(res, "Bulk room creation completed", {
    created: createdRooms.length,
    errors: errors.length > 0 ? errors : undefined,
    rooms: createdRooms
  });
});

export const updateRoomStatus = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { roomStatus } = req.body;

  if (!roomStatus || !["available", "full", "maintenance", "reserved"].includes(roomStatus)) {
    return badRequestResponse(res, "Invalid room status");
  }

  const room = await Room.findById(id);
  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  const oldStatus = room.roomStatus;
  room.roomStatus = roomStatus;
  await room.save();

  const buildingUpdate = {};
  if (oldStatus === "available" && roomStatus !== "available") {
    buildingUpdate.$inc = { "stats.availableRooms": -1 };
  } else if (oldStatus !== "available" && roomStatus === "available") {
    buildingUpdate.$inc = { "stats.availableRooms": 1 };
  }

  if (oldStatus === "full" && roomStatus !== "full") {
    buildingUpdate.$inc = { ...buildingUpdate.$inc, "stats.occupiedRooms": -1 };
  } else if (oldStatus !== "full" && roomStatus === "full") {
    buildingUpdate.$inc = { ...buildingUpdate.$inc, "stats.occupiedRooms": 1 };
  }

  if (Object.keys(buildingUpdate).length > 0) {
    await Building.findByIdAndUpdate(room.buildingId, buildingUpdate);
  }

  successResponse(res, "Room status updated successfully", { room });
});

/**
 * Tự động tạo phòng hàng loạt theo pattern
 * POST /api/rooms/auto-generate
 */
export const autoGenerateRooms = expressAsyncHandler(async (req, res) => {
  const {
    buildingId,
    startFloor = 1,
    endFloor,
    roomsPerFloor,
    roomType,
    capacity,
    area = 25,
    pricePerMonth = 500000,
    facilities,
    notes
  } = req.body;

  if (!buildingId || !endFloor || !roomsPerFloor || !roomType || !capacity) {
    return badRequestResponse(res, "buildingId, endFloor, roomsPerFloor, roomType, and capacity are required");
  }

  const building = await Building.findById(buildingId);
  if (!building) {
    return notFoundResponse(res, "Building not found");
  }

  if (startFloor < 1 || endFloor > building.totalFloors || startFloor > endFloor) {
    return badRequestResponse(res, `Floor range must be between 1 and ${building.totalFloors}`);
  }

  if (roomsPerFloor < 1 || roomsPerFloor > 100) {
    return badRequestResponse(res, "roomsPerFloor must be between 1 and 100");
  }

  const gender = building.buildingType === "mixed" ? req.body.gender : building.buildingType;
  if (!gender) {
    return badRequestResponse(res, "gender is required for mixed building");
  }

  const generatedRooms = [];
  const errors = [];
  const defaultFacilities = facilities || getDefaultFacilities(roomType);

  for (let floor = startFloor; floor <= endFloor; floor++) {
    for (let roomIndex = 1; roomIndex <= roomsPerFloor; roomIndex++) {
      const roomNumber = generateRoomNumber(floor, roomIndex);
      const roomCode = generateRoomCode(building.buildingCode, roomNumber);

      const existingRoom = await Room.findOne({
        $or: [{ buildingId, roomNumber }, { roomCode }]
      });

      if (existingRoom) {
        errors.push({ roomNumber, error: "Room already exists", floor });
        continue;
      }

      const room = new Room({
        buildingId,
        roomNumber,
        floor,
        roomCode,
        roomType,
        capacity,
        gender,
        area,
        pricePerMonth,
        facilities: defaultFacilities.map(f => ({ ...f })),
        currentOccupancy: 0,
        roomStatus: "available",
        assignedStudents: [],
        notes: notes || ""
      });

      await room.save();
      generatedRooms.push(room);
    }
  }

  if (generatedRooms.length > 0) {
    const totalCapacity = generatedRooms.reduce((sum, r) => sum + r.capacity, 0);
    await Building.findByIdAndUpdate(buildingId, {
      $inc: {
        "stats.totalRooms": generatedRooms.length,
        "stats.availableRooms": generatedRooms.length,
        "stats.totalCapacity": totalCapacity
      }
    });
  }

  successResponse(res, "Auto room generation completed", {
    summary: {
      building: building.buildingName,
      floors: `${startFloor}-${endFloor}`,
      roomsPerFloor,
      generated: generatedRooms.length,
      skipped: errors.length
    },
    roomType,
    capacity,
    errors: errors.length > 0 ? errors : undefined,
    rooms: generatedRooms
  });
});

function getDefaultFacilities(roomType) {
  const facilitiesMap = {
    "2-bed": [
      { name: "Giường đơn", quantity: 2, status: "good" },
      { name: "Bàn học", quantity: 2, status: "good" },
      { name: "Tủ quần áo", quantity: 2, status: "good" },
      { name: "Điều hòa", quantity: 1, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ],
    "4-bed": [
      { name: "Giường tầng", quantity: 4, status: "good" },
      { name: "Bàn học", quantity: 4, status: "good" },
      { name: "Tủ quần áo", quantity: 4, status: "good" },
      { name: "Điều hòa", quantity: 1, status: "good" },
      { name: "Quạt trần", quantity: 1, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ],
    "6-bed": [
      { name: "Giường tầng", quantity: 6, status: "good" },
      { name: "Bàn học", quantity: 6, status: "good" },
      { name: "Tủ quần áo", quantity: 6, status: "good" },
      { name: "Điều hòa", quantity: 2, status: "good" },
      { name: "Quạt trần", quantity: 2, status: "good" },
      { name: "Nóng lạnh", quantity: 1, status: "good" }
    ],
    "8-bed": [
      { name: "Giường tầng", quantity: 8, status: "good" },
      { name: "Bàn học", quantity: 8, status: "good" },
      { name: "Tủ quần áo", quantity: 8, status: "good" },
      { name: "Điều hòa", quantity: 2, status: "good" },
      { name: "Quạt trần", quantity: 2, status: "good" },
      { name: "Nóng lạnh", quantity: 2, status: "good" }
    ]
  };
  return facilitiesMap[roomType] || facilitiesMap["4-bed"];
}
