import RoomAssignment from "../../models/building/roomAssignment.model.js";
import Room from "../../models/building/room.model.js";
import Building from "../../models/building/building.model.js";
import Student from "../../models/user/student.model.js";
import mongoose from "mongoose";
import roomAssignmentService from "../../services/roomAssignment.service.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  createdResponse,
  notFoundResponse,
  forbiddenResponse
} from "../../utils/response.js";
import expressAsyncHandler from "express-async-handler";

export const getAllAssignments = expressAsyncHandler(async (req, res) => {
  const {
    studentId,
    roomId,
    buildingId,
    status,
    assignmentType,
    page = 1,
    limit = 20,
    sortBy = "assignedAt",
    order = "desc"
  } = req.query;

  const filter = {};
  if (studentId) filter.studentId = studentId;
  if (roomId) filter.roomId = roomId;
  if (buildingId) filter.buildingId = buildingId;
  if (status) filter.status = status;
  if (assignmentType) filter.assignmentType = assignmentType;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sortOrder = order === "desc" ? -1 : 1;

  const [assignments, total] = await Promise.all([
    RoomAssignment.find(filter)
      .populate("studentId", "studentId userId currentRoom")
      .populate({
        path: "studentId.userId",
        select: "fullName email phoneNumber gender"
      })
      .populate("roomId", "roomCode roomNumber floor buildingId")
      .populate("buildingId", "buildingCode buildingName")
      .populate("assignedBy", "fullName email")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum),
    RoomAssignment.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Room assignments retrieved successfully", {
    assignments,
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

export const getAssignmentById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const assignment = await RoomAssignment.findById(id)
    .populate({
      path: "studentId",
      select: "studentId userId currentRoom currentContract",
      populate: {
        path: "userId",
        select: "fullName email phoneNumber gender"
      }
    })
    .populate("roomId", "roomCode roomNumber floor buildingId roomType capacity")
    .populate("buildingId", "buildingCode buildingName")
    .populate("assignedBy", "fullName email")
    .populate("contractId", "contractCode startDate endDate");

  if (!assignment) {
    return notFoundResponse(res, "Room assignment not found");
  }

  successResponse(res, "Room assignment retrieved successfully", { assignment });
});

export const getStudentCurrentAssignment = expressAsyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const assignment = await RoomAssignment.findOne({
    studentId,
    status: "active"
  })
    .populate("studentId", "studentId userId")
    .populate("roomId", "roomCode roomNumber floor buildingId")
    .populate("buildingId", "buildingCode buildingName");

  if (!assignment) {
    return notFoundResponse(res, "Student has no active room assignment");
  }

  successResponse(res, "Student current assignment retrieved successfully", { assignment });
});

export const assignStudentToRoom = expressAsyncHandler(async (req, res) => {
  const { studentId, roomId, contractId, assignmentType = "new", notes } = req.body;
  const assignedBy = req.user._id;

  if (!studentId || !roomId) {
    return badRequestResponse(res, "studentId and roomId are required");
  }

  const student = await Student.findById(studentId);
  if (!student) {
    return notFoundResponse(res, "Student not found");
  }

  if (student.currentRoom) {
    return badRequestResponse(res, "Student already has an assigned room. Please use transfer instead.");
  }

  const room = await Room.findById(roomId).populate("buildingId", "buildingCode buildingName");
  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  if (room.roomStatus === "maintenance") {
    return badRequestResponse(res, "Room is under maintenance");
  }

  if (room.currentOccupancy >= room.capacity) {
    return badRequestResponse(res, "Room is full");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const assignment = new RoomAssignment({
      studentId,
      roomId,
      buildingId: room.buildingId._id,
      contractId: contractId || null,
      assignmentType,
      assignedBy,
      assignedAt: new Date(),
      checkInDate: new Date(),
      status: "active",
      notes
    });

    await assignment.save({ session });

    room.assignedStudents.push({
      studentId,
      assignedAt: new Date(),
      contractId: contractId || null
    });
    room.currentOccupancy += 1;

    if (room.currentOccupancy >= room.capacity) {
      room.roomStatus = "full";
    } else if (room.roomStatus === "available") {
      room.roomStatus = room.currentOccupancy > 0 ? "reserved" : "available";
    }

    await room.save({ session });

    student.currentRoom = roomId;
    if (contractId) student.currentContract = contractId;
    student.ktxStatus = "checked_in";
    await student.save({ session });

    await Building.findByIdAndUpdate(
      room.buildingId._id,
      {
        $inc: {
          "stats.currentOccupancy": 1,
          "stats.availableRooms": room.currentOccupancy === 1 ? -1 : 0,
          "stats.occupiedRooms": room.currentOccupancy >= room.capacity ? 1 : 0
        }
      },
      { session }
    );

    await session.commitTransaction();

    const populatedAssignment = await RoomAssignment.findById(assignment._id)
      .populate("studentId", "studentId userId")
      .populate("roomId", "roomCode roomNumber floor")
      .populate("buildingId", "buildingCode buildingName");

    createdResponse(res, "Student assigned to room successfully", {
      assignment: populatedAssignment
    });
  } catch (error) {
    await session.abortTransaction();
    errorResponse(res, error.message, 500);
  } finally {
    session.endSession();
  }
});

export const transferStudent = expressAsyncHandler(async (req, res) => {
  const { assignmentId, newRoomId, transferReason, notes } = req.body;
  const assignedBy = req.user._id;

  if (!assignmentId || !newRoomId) {
    return badRequestResponse(res, "assignmentId and newRoomId are required");
  }

  const currentAssignment = await RoomAssignment.findById(assignmentId);
  if (!currentAssignment) {
    return notFoundResponse(res, "Current assignment not found");
  }

  if (currentAssignment.status !== "active") {
    return badRequestResponse(res, "Can only transfer active assignments");
  }

  const newRoom = await Room.findById(newRoomId).populate("buildingId", "buildingCode buildingName");
  if (!newRoom) {
    return notFoundResponse(res, "New room not found");
  }

  if (newRoom._id.toString() === currentAssignment.roomId.toString()) {
    return badRequestResponse(res, "Cannot transfer to the same room");
  }

  if (newRoom.roomStatus === "maintenance") {
    return badRequestResponse(res, "New room is under maintenance");
  }

  if (newRoom.currentOccupancy >= newRoom.capacity) {
    return badRequestResponse(res, "New room is full");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const oldRoom = await Room.findById(currentAssignment.roomId);

    oldRoom.assignedStudents = oldRoom.assignedStudents.filter(
      s => s.studentId.toString() !== currentAssignment.studentId.toString()
    );
    oldRoom.currentOccupancy -= 1;

    if (oldRoom.currentOccupancy < oldRoom.capacity && oldRoom.roomStatus === "full") {
      oldRoom.roomStatus = oldRoom.currentOccupancy > 0 ? "reserved" : "available";
    }

    await oldRoom.save({ session });

    newRoom.assignedStudents.push({
      studentId: currentAssignment.studentId,
      assignedAt: new Date(),
      contractId: currentAssignment.contractId
    });
    newRoom.currentOccupancy += 1;

    if (newRoom.currentOccupancy >= newRoom.capacity) {
      newRoom.roomStatus = "full";
    } else if (newRoom.currentOccupancy > 0) {
      newRoom.roomStatus = "reserved";
    }

    await newRoom.save({ session });

    currentAssignment.status = "transferred";
    currentAssignment.checkOutDate = new Date();
    await currentAssignment.save({ session });

    const newAssignment = new RoomAssignment({
      studentId: currentAssignment.studentId,
      roomId: newRoomId,
      buildingId: newRoom.buildingId._id,
      contractId: currentAssignment.contractId,
      assignmentType: "transfer",
      assignedBy,
      assignedAt: new Date(),
      checkInDate: new Date(),
      status: "active",
      previousAssignmentId: currentAssignment._id,
      transferReason,
      notes
    });

    await newAssignment.save({ session });

    await Student.findByIdAndUpdate(
      currentAssignment.studentId,
      { currentRoom: newRoomId },
      { session }
    );

    await Building.findByIdAndUpdate(
      oldRoom.buildingId,
      {
        $inc: {
          "stats.currentOccupancy": -1,
          "stats.occupiedRooms": oldRoom.currentOccupancy + 1 >= oldRoom.capacity ? -1 : 0
        }
      },
      { session }
    );

    await Building.findByIdAndUpdate(
      newRoom.buildingId._id,
      {
        $inc: {
          "stats.currentOccupancy": 1,
          "stats.occupiedRooms": newRoom.currentOccupancy >= newRoom.capacity ? 1 : 0
        }
      },
      { session }
    );

    await session.commitTransaction();

    const populatedAssignment = await RoomAssignment.findById(newAssignment._id)
      .populate("studentId", "studentId userId")
      .populate("roomId", "roomCode roomNumber floor")
      .populate("buildingId", "buildingCode buildingName");

    successResponse(res, "Student transferred successfully", {
      newAssignment: populatedAssignment,
      oldAssignmentId: currentAssignment._id
    });
  } catch (error) {
    await session.abortTransaction();
    errorResponse(res, error.message, 500);
  } finally {
    session.endSession();
  }
});

export const checkOutStudent = expressAsyncHandler(async (req, res) => {
  const { assignmentId, checkOutDate } = req.body;

  if (!assignmentId) {
    return badRequestResponse(res, "assignmentId is required");
  }

  const assignment = await RoomAssignment.findById(assignmentId);
  if (!assignment) {
    return notFoundResponse(res, "Room assignment not found");
  }

  if (assignment.status !== "active") {
    return badRequestResponse(res, "Can only check out active assignments");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const room = await Room.findById(assignment.roomId);

    room.assignedStudents = room.assignedStudents.filter(
      s => s.studentId.toString() !== assignment.studentId.toString()
    );
    room.currentOccupancy -= 1;

    if (room.roomStatus === "full" && room.currentOccupancy < room.capacity) {
      room.roomStatus = room.currentOccupancy > 0 ? "reserved" : "available";
    }

    await room.save({ session });

    assignment.status = "ended";
    assignment.checkOutDate = checkOutDate || new Date();
    await assignment.save({ session });

    await Student.findByIdAndUpdate(
      assignment.studentId,
      {
        currentRoom: null,
        currentContract: null,
        ktxStatus: "checked_out"
      },
      { session }
    );

    await Building.findByIdAndUpdate(
      assignment.buildingId,
      {
        $inc: {
          "stats.currentOccupancy": -1,
          "stats.occupiedRooms": room.currentOccupancy + 1 >= room.capacity ? -1 : 0,
          "stats.availableRooms": room.currentOccupancy === 0 ? 1 : 0
        }
      },
      { session }
    );

    await session.commitTransaction();

    successResponse(res, "Student checked out successfully", { assignment });
  } catch (error) {
    await session.abortTransaction();
    errorResponse(res, error.message, 500);
  } finally {
    session.endSession();
  }
});

export const getAssignmentHistory = expressAsyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [assignments, total] = await Promise.all([
    RoomAssignment.find({ studentId })
      .populate("roomId", "roomCode roomNumber floor buildingId")
      .populate("buildingId", "buildingCode buildingName")
      .populate("assignedBy", "fullName")
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(limitNum),
    RoomAssignment.countDocuments({ studentId })
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Assignment history retrieved successfully", {
    assignments,
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

export const getRoomOccupancyHistory = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [assignments, total] = await Promise.all([
    RoomAssignment.find({ roomId })
      .populate({
        path: "studentId",
        select: "studentId userId",
        populate: {
          path: "userId",
          select: "fullName"
        }
      })
      .populate("assignedBy", "fullName")
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(limitNum),
    RoomAssignment.countDocuments({ roomId })
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Room occupancy history retrieved successfully", {
    assignments,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalItems: total,
      itemsPerPage: limitNum
    }
  });
});

// ============ AUTO ASSIGNMENT FEATURES ============

export const findBestRoom = expressAsyncHandler(async (req, res) => {
  const { studentId, preferredBuildingId, preferredFloor, roomType, preferredRoommateIds, allowMixedBuilding } = req.body;

  if (!studentId) {
    return badRequestResponse(res, "studentId is required");
  }

  try {
    const result = await roomAssignmentService.findBestRoom({
      studentId,
      preferredBuildingId,
      preferredFloor,
      roomType,
      preferredRoommateIds,
      allowMixedBuilding
    });

    successResponse(res, "Best room found successfully", result);
  } catch (error) {
    badRequestResponse(res, error.message);
  }
});

export const autoAssignStudent = expressAsyncHandler(async (req, res) => {
  const { studentId, preferredBuildingId, preferredFloor, roomType, notes } = req.body;
  const assignedBy = req.user._id;

  if (!studentId) {
    return badRequestResponse(res, "studentId is required");
  }

  try {
    const { bestMatch } = await roomAssignmentService.findBestRoom({
      studentId,
      preferredBuildingId,
      preferredFloor,
      roomType
    });

    const assignment = await roomAssignmentService.executeAssignment(
      studentId,
      bestMatch.room._id,
      assignedBy,
      "auto"
    );

    const populatedAssignment = await RoomAssignment.findById(assignment._id)
      .populate("studentId", "studentId userId")
      .populate("roomId", "roomCode roomNumber floor buildingId")
      .populate("buildingId", "buildingCode buildingName");

    createdResponse(res, "Student automatically assigned to room successfully", {
      assignment: populatedAssignment,
      matchDetails: {
        score: bestMatch.score,
        matchPercentage: bestMatch.matchPercentage,
        reasons: bestMatch.reasons
      }
    });
  } catch (error) {
    badRequestResponse(res, error.message);
  }
});

export const autoAssignMultiple = expressAsyncHandler(async (req, res) => {
  const {
    studentIds,
    preferredBuildingId,
    roomType,
    assignByFloor,
    respectPreferences
  } = req.body;
  const assignedBy = req.user._id;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return badRequestResponse(res, "studentIds array is required");
  }

  if (studentIds.length > 100) {
    return badRequestResponse(res, "Cannot process more than 100 students at once");
  }

  try {
    const results = await roomAssignmentService.autoAssignMultipleStudents(studentIds, {
      preferredBuildingId,
      roomType,
      assignByFloor,
      respectPreferences,
      assignedBy
    });

    successResponse(res, "Auto assignment completed", {
      summary: {
        total: studentIds.length,
        success: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped?.length || 0
      },
      results
    });
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
});

export const suggestRooms = expressAsyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { limit, preferredBuildingId, preferredFloor, roomType } = req.query;

  try {
    const suggestions = await roomAssignmentService.suggestRooms(studentId, {
      limit: parseInt(limit) || 5,
      preferredBuildingId,
      preferredFloor: preferredFloor ? parseInt(preferredFloor) : undefined,
      roomType
    });

    successResponse(res, "Room suggestions retrieved successfully", suggestions);
  } catch (error) {
    badRequestResponse(res, error.message);
  }
});

export const findRoomForGroup = expressAsyncHandler(async (req, res) => {
  const { studentIds, preferredBuildingId, roomType, allowMixedGender } = req.body;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return badRequestResponse(res, "studentIds array is required");
  }

  if (studentIds.length > 8) {
    return badRequestResponse(res, "Group size cannot exceed 8 students");
  }

  try {
    const result = await roomAssignmentService.findRoomForGroup(studentIds, {
      preferredBuildingId,
      roomType,
      allowMixedGender
    });

    successResponse(res, "Rooms found for group", result);
  } catch (error) {
    badRequestResponse(res, error.message);
  }
});

export const assignGroupToRoom = expressAsyncHandler(async (req, res) => {
  const { studentIds, roomId } = req.body;
  const assignedBy = req.user._id;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return badRequestResponse(res, "studentIds array is required");
  }

  if (!roomId) {
    return badRequestResponse(res, "roomId is required");
  }

  try {
    const result = await roomAssignmentService.assignGroupToRoom(studentIds, roomId, assignedBy);

    successResponse(res, "Group assigned to room successfully", result);
  } catch (error) {
    badRequestResponse(res, error.message);
  }
});

export const getRoomAvailabilityReport = expressAsyncHandler(async (req, res) => {
  try {
    const report = await roomAssignmentService.getRoomAvailabilityReport();

    successResponse(res, "Room availability report generated", report);
  } catch (error) {
    errorResponse(res, error.message, 500);
  }
});
