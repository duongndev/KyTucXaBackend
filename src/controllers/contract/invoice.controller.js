import Invoice from "../../models/contract/invoice.model.js";
import Contract from "../../models/contract/contract.model.js";
import Payment from "../../models/contract/payment.model.js";
import Student from "../../models/user/student.model.js";
import { generateInvoiceCode } from "../../utils/generators.js";
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

export const getAllInvoices = expressAsyncHandler(async (req, res) => {
  const {
    studentId,
    contractId,
    status,
    month,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    order = "desc"
  } = req.query;

  const filter = {};
  if (studentId) filter.studentId = studentId;
  if (contractId) filter.contractId = contractId;
  if (status) filter.status = status;
  if (month) filter.month = month;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sortOrder = order === "desc" ? -1 : 1;

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate({
        path: "studentId",
        populate: {
          path: "userId",
          select: "fullName email phoneNumber"
        }
      })
      .populate("contractId", "contractCode startDate endDate")
      .populate("roomId", "roomCode roomNumber")
      .populate("generatedBy", "fullName")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum),
    Invoice.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Invoices retrieved successfully", {
    invoices,
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

export const getInvoiceById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const invoice = await Invoice.findById(id)
    .populate({
      path: "studentId",
      populate: {
        path: "userId",
        select: "fullName email phoneNumber"
      }
    })
    .populate("contractId", "contractCode startDate endDate monthlyRent")
    .populate("roomId", "roomCode roomNumber buildingId")
    .populate("generatedBy", "fullName email");

  if (!invoice) {
    return notFoundResponse(res, "Invoice not found");
  }

  const payments = await Payment.find({ invoiceId: id })
    .populate("verifiedBy", "fullName")
    .sort({ createdAt: -1 });

  successResponse(res, "Invoice retrieved successfully", {
    invoice,
    payments
  });
});

export const getMyInvoices = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Student profile not found");
  }

  const { status, page = 1, limit = 20 } = req.query;

  const options = {
    status,
    page: parseInt(page),
    limit: parseInt(limit)
  };

  const result = await Invoice.findByStudent(student._id, options);
  const totalPending = await Invoice.countDocuments({
    studentId: student._id,
    status: { $in: ["pending", "partial", "overdue"] }
  });

  const balance = await Invoice.getStudentBalance(student._id);

  successResponse(res, "My invoices retrieved successfully", {
    invoices: result,
    summary: {
      totalPending,
      totalOwed: balance.totalOwed,
      totalPaid: balance.totalPaid
    }
  });
});

export const createInvoice = expressAsyncHandler(async (req, res) => {
  const {
    contractId,
    month,
    items,
    discount = 0,
    discountReason,
    dueDate,
    notes,
    isFirstInvoice = false
  } = req.body;

  if (!contractId || !month || !items || !dueDate) {
    return badRequestResponse(res, "Missing required fields: contractId, month, items, dueDate");
  }

  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(month)) {
    return badRequestResponse(res, "Month must be in format YYYY-MM");
  }

  const contract = await Contract.findById(contractId);
  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  if (!["active", "pending_signature"].includes(contract.status)) {
    return badRequestResponse(res, `Cannot create invoice for contract with status: ${contract.status}`);
  }

  const existingInvoice = await Invoice.findOne({ contractId, month });
  if (existingInvoice) {
    return badRequestResponse(res, "Invoice already exists for this contract and month", {
      existingInvoiceId: existingInvoice._id,
      existingInvoiceCode: existingInvoice.invoiceCode
    });
  }

  let subTotal = 0;
  for (const item of items) {
    if (!item.type || !item.amount || item.amount < 0) {
      return badRequestResponse(res, "Each item must have type and positive amount");
    }
    subTotal += item.amount;
  }

  const totalAmount = Math.max(0, subTotal - discount);

  const [year, monthNum] = month.split("-").map(Number);
  const periodStart = new Date(year, monthNum - 1, 1);
  const periodEnd = new Date(year, monthNum, 0);

  const invoiceCode = await generateInvoiceCode();

  const invoice = new Invoice({
    invoiceCode,
    contractId,
    studentId: contract.studentId,
    roomId: contract.roomId,
    month,
    period: {
      start: periodStart,
      end: periodEnd
    },
    items,
    subTotal,
    discount,
    discountReason,
    totalAmount,
    dueDate: new Date(dueDate),
    generatedBy: req.user._id,
    isFirstInvoice,
    notes
  });

  await invoice.save();

  createdResponse(res, "Invoice created successfully", {
    invoice: await Invoice.findById(invoice._id)
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName email" }
      })
      .populate("contractId", "contractCode")
      .populate("roomId", "roomCode")
  });
});

export const generateMonthlyInvoice = expressAsyncHandler(async (req, res) => {
  const { contractId, month, dueDate } = req.body;

  if (!contractId || !month || !dueDate) {
    return badRequestResponse(res, "Missing required fields: contractId, month, dueDate");
  }

  const contract = await Contract.findById(contractId);
  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  if (contract.status !== "active") {
    return badRequestResponse(res, `Cannot generate invoice for contract with status: ${contract.status}`);
  }

  const existingInvoice = await Invoice.findOne({ contractId, month });
  if (existingInvoice) {
    return badRequestResponse(res, "Invoice already exists for this month", {
      existingInvoiceId: existingInvoice._id,
      existingInvoiceCode: existingInvoice.invoiceCode
    });
  }

  const [year, monthNum] = month.split("-").map(Number);
  const periodStart = new Date(year, monthNum - 1, 1);
  const periodEnd = new Date(year, monthNum, 0);

  const items = [
    {
      type: "room_rent",
      amount: contract.monthlyRent,
      description: `Tiền phòng tháng ${monthNum}/${year}`,
      quantity: 1,
      unitPrice: contract.monthlyRent
    }
  ];

  const invoiceCode = await generateInvoiceCode();

  const invoice = new Invoice({
    invoiceCode,
    contractId,
    studentId: contract.studentId,
    roomId: contract.roomId,
    month,
    period: {
      start: periodStart,
      end: periodEnd
    },
    items,
    subTotal: contract.monthlyRent,
    discount: 0,
    totalAmount: contract.monthlyRent,
    dueDate: new Date(dueDate),
    generatedBy: req.user._id,
    isFirstInvoice: false
  });

  await invoice.save();

  createdResponse(res, "Monthly invoice generated successfully", {
    invoice: await Invoice.findById(invoice._id)
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName email" }
      })
      .populate("roomId", "roomCode")
  });
});

export const applyDiscount = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { discountAmount, reason } = req.body;

  if (discountAmount === undefined || discountAmount < 0) {
    return badRequestResponse(res, "Valid discount amount is required");
  }

  const invoice = await Invoice.findById(id);
  if (!invoice) {
    return notFoundResponse(res, "Invoice not found");
  }

  if (invoice.status !== "pending") {
    return badRequestResponse(res, `Cannot apply discount to invoice with status: ${invoice.status}`);
  }

  await invoice.applyDiscount(discountAmount, reason);

  successResponse(res, "Discount applied successfully", { invoice });
});

export const cancelInvoice = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const invoice = await Invoice.findById(id);
  if (!invoice) {
    return notFoundResponse(res, "Invoice not found");
  }

  if (invoice.status === "paid") {
    return badRequestResponse(res, "Cannot cancel paid invoice. Use refund instead.");
  }

  if (invoice.status === "cancelled") {
    return badRequestResponse(res, "Invoice is already cancelled");
  }

  await invoice.cancel(reason || "Cancelled by admin");

  successResponse(res, "Invoice cancelled successfully", { invoice });
});

export const getOverdueInvoices = expressAsyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const overdueInvoices = await Invoice.findOverdue()
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  const total = await Invoice.countDocuments({
    status: { $in: ["pending", "partial"] },
    dueDate: { $lt: new Date() }
  });

  successResponse(res, "Overdue invoices retrieved", {
    invoices: overdueInvoices,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / parseInt(limit))
  });
});

export const markAsOverdue = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const invoice = await Invoice.findById(id);
  if (!invoice) {
    return notFoundResponse(res, "Invoice not found");
  }

  if (invoice.status !== "pending" && invoice.status !== "partial") {
    return badRequestResponse(res, `Cannot mark as overdue: status is ${invoice.status}`);
  }

  if (new Date() <= invoice.dueDate) {
    return badRequestResponse(res, "Invoice is not yet overdue");
  }

  await invoice.markAsOverdue();

  successResponse(res, "Invoice marked as overdue", { invoice });
});

export const getInvoiceStats = expressAsyncHandler(async (req, res) => {
  const { yearMonth } = req.query;

  const stats = await Invoice.getMonthlyStats(yearMonth || new Date().toISOString().slice(0, 7));

  const totalRevenue = await Invoice.aggregate([
    {
      $match: {
        status: { $in: ["paid", "partial"] }
      }
    },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$paidAmount" },
        count: { $sum: 1 }
      }
    }
  ]);

  successResponse(res, "Invoice statistics", {
    monthlyStats: stats,
    totalRevenue: totalRevenue[0] || { totalPaid: 0, count: 0 }
  });
});

export const getMyPendingInvoices = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Student profile not found");
  }

  const pendingInvoices = await Invoice.findPendingByStudent(student._id);
  const totalAmount = pendingInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0);

  successResponse(res, "Pending invoices retrieved", {
    invoices: pendingInvoices,
    totalCount: pendingInvoices.length,
    totalAmountDue: totalAmount
  });
});
