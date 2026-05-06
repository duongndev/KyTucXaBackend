import SemesterInvoice from "../../models/contract/semesterInvoice.model.js";
import Contract from "../../models/contract/contract.model.js";
import Room from "../../models/building/room.model.js";
import Student from "../../models/user/student.model.js";
import utilityService from "../../services/utility.service.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  notFoundResponse,
  createdResponse
} from "../../utils/response.js";
import expressAsyncHandler from "express-async-handler";

export const getAllSemesterInvoices = expressAsyncHandler(async (req, res) => {
  const { year, billingCycle, status, studentId, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (year) filter.year = parseInt(year);
  if (billingCycle) filter.billingCycle = billingCycle;
  if (status) filter.status = status;
  if (studentId) filter.studentId = studentId;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [invoices, total] = await Promise.all([
    SemesterInvoice.find(filter)
      .populate("studentId", "studentId userId")
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName email" }
      })
      .populate("contractId", "contractCode")
      .populate("roomId", "roomCode")
      .sort({ year: -1, periodNumber: -1 })
      .skip(skip)
      .limit(limitNum),
    SemesterInvoice.countDocuments(filter)
  ]);

  successResponse(res, "Room rent invoices retrieved", {
    invoices,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total
    }
  });
});

export const getSemesterInvoiceById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const invoice = await SemesterInvoice.findById(id)
    .populate("studentId", "studentId userId")
    .populate({
      path: "studentId",
      populate: { path: "userId", select: "fullName email phoneNumber" }
    })
    .populate("contractId", "contractCode startDate endDate")
    .populate("roomId", "roomCode roomNumber buildingId")
    .populate("generatedBy", "fullName");

  if (!invoice) {
    return notFoundResponse(res, "Semester invoice not found");
  }

  successResponse(res, "Semester invoice retrieved", { invoice });
});

export const getMySemesterInvoices = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Student profile not found");
  }

  const { status, year, page = 1, limit = 20 } = req.query;

  const options = {
    status,
    year: year ? parseInt(year) : undefined,
    page: parseInt(page),
    limit: parseInt(limit)
  };

  const invoices = await SemesterInvoice.findByStudent(student._id, options);

  const pendingInvoices = invoices.filter(inv => ["pending", "partial", "overdue"].includes(inv.status));
  const totalDue = pendingInvoices.reduce((sum, inv) => sum + (inv.roomRent.totalAmount - inv.paidAmount), 0);

  const balance = await SemesterInvoice.getStudentBalance(student._id);

  successResponse(res, "My semester invoices", {
    invoices,
    summary: {
      totalPending: pendingInvoices.length,
      totalDue,
      ...balance
    }
  });
});

export const createRoomRentInvoices = expressAsyncHandler(async (req, res) => {
  const { year, periodNumber, billingCycle = "6month" } = req.body;

  if (!year || !periodNumber) {
    return badRequestResponse(res, "Year and periodNumber are required");
  }

  const validCycles = ["6month", "3month", "12month", "semester"];
  if (!validCycles.includes(billingCycle)) {
    return badRequestResponse(res, `Invalid billing cycle. Must be one of: ${validCycles.join(", ")}`);
  }

  const result = await utilityService.createRoomRentInvoices(year, periodNumber, billingCycle, req.user._id);

  successResponse(res, "Room rent invoices generated", result);
});

// Convenience method for 6-month invoices (most common)
export const create6MonthInvoices = expressAsyncHandler(async (req, res) => {
  const { year, periodNumber } = req.body;

  if (!year || !periodNumber) {
    return badRequestResponse(res, "Year and periodNumber are required (period 1 = T1-T6, period 2 = T7-T12)");
  }

  const result = await utilityService.create6MonthRoomRentInvoices(year, periodNumber, req.user._id);

  successResponse(res, "6-month room rent invoices generated", result);
});

export const paySemesterInvoice = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, paymentMethod, notes } = req.body;

  if (!amount || amount <= 0) {
    return badRequestResponse(res, "Valid amount is required");
  }

  const invoice = await SemesterInvoice.findById(id);
  if (!invoice) {
    return notFoundResponse(res, "Semester invoice not found");
  }

  const remaining = invoice.roomRent.totalAmount - invoice.paidAmount;
  if (amount > remaining) {
    return badRequestResponse(res, `Amount exceeds remaining balance. Remaining: ${remaining}`);
  }

  // Create mock payment ID - in real implementation, this would integrate with Payment model
  const paymentId = `SEM${Date.now()}`;

  await invoice.addPayment(amount, paymentId, paymentMethod || "bank_transfer", notes);

  successResponse(res, "Payment recorded", {
    invoice: await SemesterInvoice.findById(id)
      .populate("studentId", "studentId")
      .populate("roomId", "roomCode")
  });
});

export const applyDiscount = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { discountAmount, reason } = req.body;

  if (discountAmount === undefined || discountAmount < 0) {
    return badRequestResponse(res, "Valid discount amount is required");
  }

  const invoice = await SemesterInvoice.findById(id);
  if (!invoice) {
    return notFoundResponse(res, "Semester invoice not found");
  }

  if (invoice.status === "paid") {
    return badRequestResponse(res, "Cannot apply discount to paid invoice");
  }

  await invoice.applyDiscount(discountAmount, reason);

  successResponse(res, "Discount applied", { invoice });
});

export const getBillingStats = expressAsyncHandler(async (req, res) => {
  const { year, billingCycle } = req.query;

  if (!year) {
    return badRequestResponse(res, "Year is required");
  }

  const stats = await SemesterInvoice.getBillingStats(parseInt(year), billingCycle);

  const summary = {
    totalInvoices: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalRemaining: 0
  };

  for (const stat of stats) {
    summary.totalInvoices += stat.count;
    summary.totalAmount += stat.totalAmount;
    summary.totalPaid += stat.paidAmount;
    summary.totalRemaining += (stat.totalAmount - stat.paidAmount);
  }

  successResponse(res, "Room rent billing statistics", {
    billingCycle: billingCycle || "all",
    stats,
    summary
  });
});

export const generateMonthlyBilling = expressAsyncHandler(async (req, res) => {
  const { year, month } = req.body;

  if (!year || !month) {
    return badRequestResponse(res, "Year and month are required");
  }

  const result = await utilityService.generateMonthlyBilling(year, month, req.user._id);

  successResponse(res, "Monthly billing generated", result);
});

export const getPendingSemesterInvoices = expressAsyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const invoices = await SemesterInvoice.find({
    status: { $in: ["pending", "partial", "overdue"] }
  })
    .populate("studentId", "studentId userId")
    .populate({
      path: "studentId",
      populate: { path: "userId", select: "fullName email" }
    })
    .populate("roomId", "roomCode")
    .sort({ dueDate: 1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  const total = await SemesterInvoice.countDocuments({
    status: { $in: ["pending", "partial", "overdue"] }
  });

  successResponse(res, "Pending semester invoices", {
    invoices,
    total,
    page: parseInt(page)
  });
});

export const cancelSemesterInvoice = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const invoice = await SemesterInvoice.findById(id);
  if (!invoice) {
    return notFoundResponse(res, "Semester invoice not found");
  }

  if (invoice.status === "paid") {
    return badRequestResponse(res, "Cannot cancel paid invoice. Use refund instead.");
  }

  invoice.status = "cancelled";
  invoice.notes = reason || "Cancelled by admin";
  await invoice.save();

  successResponse(res, "Semester invoice cancelled", { invoice });
});
