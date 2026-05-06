import Student from "../../models/user/student.model.js";
import User from "../../models/user/user.model.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  notFoundResponse
} from "../../utils/response.js";
import expressAsyncHandler from "express-async-handler";

/**
 * Lấy danh sách sinh viên đang chờ phân phòng
 * GET /api/students/pending-room
 */
export const getStudentsPendingRoom = expressAsyncHandler(async (req, res) => {
  const { page = 1, limit = 10, university, gender, search } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Filter: sinh viên chưa có phòng và đang chờ
  const filter = {
    currentRoom: null,
    ktxStatus: { $in: ["waiting_room", "not_registered"] }
  };

  if (university) filter.university = { $regex: university, $options: "i" };

  // Pipeline để join với User và filter theo gender
  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" }
  ];

  if (gender) {
    pipeline.push({ $match: { "user.gender": gender } });
  }

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { studentId: { $regex: search, $options: "i" } },
          { "user.fullName": { $regex: search, $options: "i" } },
          { "user.email": { $regex: search, $options: "i" } }
        ]
      }
    });
  }

  // Count total
  const countPipeline = [...pipeline, { $count: "total" }];
  const countResult = await Student.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  // Get data with pagination
  pipeline.push(
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limitNum },
    {
      $project: {
        _id: 1,
        studentId: 1,
        university: 1,
        major: 1,
        className: 1,
        academicYear: 1,
        ktxStatus: 1,
        createdAt: 1,
        user: {
          fullName: "$user.fullName",
          email: "$user.email",
          phoneNumber: "$user.phoneNumber",
          gender: "$user.gender",
          dateOfBirth: "$user.dateOfBirth"
        }
      }
    }
  );

  const students = await Student.aggregate(pipeline);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Students pending room retrieved successfully", {
    students,
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

/**
 * Lấy thông tin chi tiết sinh viên
 * GET /api/students/:id
 */
export const getStudentById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const student = await Student.findById(id)
    .populate("userId", "fullName email phoneNumber gender dateOfBirth address")
    .populate("currentRoom", "roomCode roomNumber floor buildingId")
    .populate("currentContract", "contractCode startDate endDate status");

  if (!student) {
    return notFoundResponse(res, "Student not found");
  }

  successResponse(res, "Student retrieved successfully", { student });
});

/**
 * Lấy danh sách tất cả sinh viên
 * GET /api/students
 */
export const getAllStudents = expressAsyncHandler(async (req, res) => {
  const { page = 1, limit = 10, university, gender, ktxStatus, search } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  if (university) filter.university = { $regex: university, $options: "i" };
  if (ktxStatus) filter.ktxStatus = ktxStatus;

  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" }
  ];

  if (gender) {
    pipeline.push({ $match: { "user.gender": gender } });
  }

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { studentId: { $regex: search, $options: "i" } },
          { "user.fullName": { $regex: search, $options: "i" } },
          { "user.email": { $regex: search, $options: "i" } }
        ]
      }
    });
  }

  // Lookup room information
  pipeline.push(
    {
      $lookup: {
        from: "rooms",
        localField: "currentRoom",
        foreignField: "_id",
        as: "room"
      }
    },
    { $unwind: { path: "$room", preserveNullAndEmptyArrays: true } }
  );

  const countPipeline = [...pipeline, { $count: "total" }];
  const countResult = await Student.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  pipeline.push(
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limitNum },
    {
      $project: {
        _id: 1,
        studentId: 1,
        university: 1,
        major: 1,
        className: 1,
        academicYear: 1,
        ktxStatus: 1,
        currentRoom: 1,
        createdAt: 1,
        user: {
          fullName: "$user.fullName",
          email: "$user.email",
          phoneNumber: "$user.phoneNumber",
          gender: "$user.gender",
          dateOfBirth: "$user.dateOfBirth"
        },
        room: {
          _id: "$room._id",
          roomCode: "$room.roomCode",
          roomNumber: "$room.roomNumber",
          floor: "$room.floor",
          roomType: "$room.roomType"
        }
      }
    }
  );

  const students = await Student.aggregate(pipeline);
  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Students retrieved successfully", {
    students,
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
