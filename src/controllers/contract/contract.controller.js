import Contract from "../../models/contract/contract.model.js";
import Invoice from "../../models/contract/invoice.model.js";
import Room from "../../models/building/room.model.js";
import Student from "../../models/user/student.model.js";
import RoomAssignment from "../../models/building/roomAssignment.model.js";
import { generateContractCode } from "../../utils/generators.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  notFoundResponse,
  createdResponse,
  forbiddenResponse
} from "../../utils/response.js";
import expressAsyncHandler from "express-async-handler";
import mongoose from "mongoose";

const DEFAULT_CONTRACT_TERMS = [
  {
    title: "Điều 1: Thời hạn thuê",
    content: "Thời hạn thuê phòng được tính từ ngày bắt đầu đến ngày kết thúc như đã thỏa thuận. Sinh viên phải thanh toán tiền phòng đúng hạn theo quy định.",
    order: 1
  },
  {
    title: "Điều 2: Tiền phòng và thanh toán",
    content: "Sinh viên thanh toán tiền phòng hàng tháng trước ngày 5 của tháng. Phí trễ hạn là 5% số tiền phải thanh toán cho mỗi tuần chậm trễ.",
    order: 2
  },
  {
    title: "Điều 3: Quy định ở nội trú",
    content: "Sinh viên phải tuân thủ nội quy KTX, không được tự ý chuyển nhượng phòng, không gây ồn ào sau 22h00.",
    order: 3
  },
  {
    title: "Điều 4: Chấm dứt hợp đồng",
    content: "Hai bên có quyền chấm dứt hợp đồng với thông báo trước 30 ngày. Sinh viên vi phạm nghiêm trọng có thể bị đuổi ngay lập tức.",
    order: 4
  }
];

export const getAllContracts = expressAsyncHandler(async (req, res) => {
  const {
    studentId,
    roomId,
    status,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    order = "desc"
  } = req.query;

  const filter = {};
  if (studentId) filter.studentId = studentId;
  if (roomId) filter.roomId = roomId;
  if (status) filter.status = status;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sortOrder = order === "desc" ? -1 : 1;

  const [contracts, total] = await Promise.all([
    Contract.find(filter)
      .populate("studentId", "studentId userId")
      .populate({
        path: "studentId",
        populate: {
          path: "userId",
          select: "fullName email phoneNumber"
        }
      })
      .populate("roomId", "roomCode roomNumber buildingId")
      .populate({
        path: "roomId",
        populate: {
          path: "buildingId",
          select: "buildingCode buildingName"
        }
      })
      .populate("roomAssignmentId")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum),
    Contract.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Contracts retrieved successfully", {
    contracts,
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

export const getContractById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const contract = await Contract.findById(id)
    .populate({
      path: "studentId",
      select: "studentId university major className academicYear",
      populate: {
        path: "userId",
        select: "fullName email phoneNumber gender dateOfBirth"
      }
    })
    .populate({
      path: "roomId",
      populate: {
        path: "buildingId",
        select: "buildingCode buildingName"
      }
    })
    .populate("roomAssignmentId")
    .populate("signatures.admin.signedBy", "fullName email")
    .populate("terminatedBy", "fullName");

  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  successResponse(res, "Contract retrieved successfully", { contract });
});

export const createContract = expressAsyncHandler(async (req, res) => {
  const {
    studentId,
    roomId,
    roomAssignmentId,
    startDate,
    endDate,
    depositAmount,
    monthlyRent,
    customTerms,
    notes
  } = req.body;

  if (!studentId || !roomId || !roomAssignmentId || !startDate || !endDate) {
    return badRequestResponse(res, "Missing required fields: studentId, roomId, roomAssignmentId, startDate, endDate");
  }

  const student = await Student.findById(studentId).populate("userId", "fullName");
  if (!student) {
    return notFoundResponse(res, "Student not found");
  }

  const room = await Room.findById(roomId).populate("buildingId", "buildingName");
  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  const assignment = await RoomAssignment.findById(roomAssignmentId);
  if (!assignment) {
    return notFoundResponse(res, "Room assignment not found");
  }

  if (assignment.studentId.toString() !== studentId) {
    return badRequestResponse(res, "Room assignment does not belong to this student");
  }

  const existingActiveContract = await Contract.findOne({
    studentId,
    status: { $in: ["draft", "pending_signature", "active"] }
  });

  if (existingActiveContract) {
    return badRequestResponse(res, "Student already has an active contract", {
      existingContractId: existingActiveContract._id,
      existingContractCode: existingActiveContract.contractCode
    });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const durationMonths = Math.round((end - start) / (30 * 24 * 60 * 60 * 1000));

  if (durationMonths < 1) {
    return badRequestResponse(res, "Contract duration must be at least 1 month");
  }

  const contractCode = await generateContractCode();
  const terms = customTerms || DEFAULT_CONTRACT_TERMS;

  const contract = new Contract({
    contractCode,
    studentId,
    roomId,
    roomAssignmentId,
    startDate: start,
    endDate: end,
    duration: durationMonths,
    depositAmount: depositAmount || room.pricePerMonth || 0,
    monthlyRent: monthlyRent || room.pricePerMonth || 0,
    terms,
    status: "draft",
    notes,
    signatures: {
      student: {},
      admin: {}
    }
  });

  await contract.save();

  student.currentContract = contract._id;
  await student.save();

  assignment.contractId = contract._id;
  await assignment.save();

  createdResponse(res, "Contract created successfully", {
    contract: await Contract.findById(contract._id)
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName email" }
      })
      .populate({
        path: "roomId",
        populate: { path: "buildingId", select: "buildingCode buildingName" }
      })
  });
});

export const signContractByStudent = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { signatureUrl } = req.body;
  const userId = req.user._id;

  if (!signatureUrl) {
    return badRequestResponse(res, "Signature URL is required");
  }

  const contract = await Contract.findById(id);
  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  if (!["draft", "pending_signature"].includes(contract.status)) {
    return badRequestResponse(res, `Cannot sign contract with status: ${contract.status}`);
  }

  const student = await Student.findById(contract.studentId);
  if (student.userId.toString() !== userId.toString()) {
    return forbiddenResponse(res, "You can only sign your own contract");
  }

  await contract.signByStudent({
    signatureUrl,
    ipAddress: req.ip,
    userAgent: req.get("User-Agent")
  });

  successResponse(res, "Contract signed by student successfully", {
    contract: await Contract.findById(id)
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName" }
      })
  });
});

export const signContractByAdmin = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { signatureUrl } = req.body;
  const adminId = req.user._id;

  if (!signatureUrl) {
    return badRequestResponse(res, "Signature URL is required");
  }

  const contract = await Contract.findById(id);
  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  await contract.signByAdmin({
    signatureUrl,
    ipAddress: req.ip,
    userAgent: req.get("User-Agent")
  }, adminId);

  successResponse(res, "Contract signed by admin successfully", {
    contract: await Contract.findById(id)
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName" }
      })
      .populate("signatures.admin.signedBy", "fullName")
  });
});

export const terminateContract = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.user._id;

  const contract = await Contract.findById(id);
  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  if (!["active", "pending_signature"].includes(contract.status)) {
    return badRequestResponse(res, `Cannot terminate contract with status: ${contract.status}`);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await contract.terminate(reason || "Contract terminated by admin", adminId);

    const student = await Student.findById(contract.studentId);
    student.currentContract = null;
    student.currentRoom = null;
    student.ktxStatus = "checked_out";
    await student.save({ session });

    const room = await Room.findById(contract.roomId);
    room.assignedStudents = room.assignedStudents.filter(
      s => s.studentId.toString() !== contract.studentId.toString()
    );
    room.currentOccupancy = Math.max(0, room.currentOccupancy - 1);
    room.roomStatus = room.currentOccupancy >= room.capacity ? "full" : "available";
    await room.save({ session });

    await RoomAssignment.findByIdAndUpdate(contract.roomAssignmentId, {
      status: "ended",
      checkOutDate: new Date()
    }, { session });

    await session.commitTransaction();

    successResponse(res, "Contract terminated successfully", {
      contract: await Contract.findById(id)
        .populate({
          path: "studentId",
          populate: { path: "userId", select: "fullName" }
        })
        .populate("terminatedBy", "fullName")
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const updateContract = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { depositAmount, monthlyRent, notes, endDate } = req.body;

  const contract = await Contract.findById(id);
  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  if (contract.status !== "draft") {
    return badRequestResponse(res, "Can only update draft contracts");
  }

  if (depositAmount !== undefined) contract.depositAmount = depositAmount;
  if (monthlyRent !== undefined) contract.monthlyRent = monthlyRent;
  if (notes !== undefined) contract.notes = notes;
  if (endDate) {
    contract.endDate = new Date(endDate);
    const durationMonths = Math.round((contract.endDate - contract.startDate) / (30 * 24 * 60 * 60 * 1000));
    contract.duration = durationMonths;
  }

  await contract.save();

  successResponse(res, "Contract updated successfully", { contract });
});

export const deleteContract = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const contract = await Contract.findById(id);
  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  if (contract.status !== "draft") {
    return badRequestResponse(res, "Can only delete draft contracts");
  }

  const invoiceCount = await Invoice.countDocuments({ contractId: id });
  if (invoiceCount > 0) {
    return badRequestResponse(res, "Cannot delete contract with existing invoices");
  }

  await Contract.findByIdAndDelete(id);

  successResponse(res, "Contract deleted successfully");
});

export const getMyContract = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Student profile not found");
  }

  const contract = await Contract.findOne({
    studentId: student._id,
    status: { $in: ["active", "pending_signature"] }
  })
    .populate({
      path: "roomId",
      populate: {
        path: "buildingId",
        select: "buildingCode buildingName"
      }
    })
    .populate("roomAssignmentId")
    .sort({ createdAt: -1 });

  if (!contract) {
    return notFoundResponse(res, "No active contract found");
  }

  successResponse(res, "My contract retrieved successfully", { contract });
});

export const getContractStats = expressAsyncHandler(async (req, res) => {
  const stats = await Contract.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalMonthlyRent: { $sum: "$monthlyRent" },
        totalDeposit: { $sum: "$depositAmount" }
      }
    }
  ]);

  const expiringSoon = await Contract.findExpiringSoon(30);

  successResponse(res, "Contract statistics", {
    stats,
    expiringSoonCount: expiringSoon.length,
    expiringSoon: expiringSoon.map(c => ({
      contractId: c._id,
      contractCode: c.contractCode,
      daysUntilExpiry: c.daysUntilExpiry
    }))
  });
});
