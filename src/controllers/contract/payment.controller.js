import Payment from "../../models/contract/payment.model.js";
import Invoice from "../../models/contract/invoice.model.js";
import Contract from "../../models/contract/contract.model.js";
import Student from "../../models/user/student.model.js";
import { generatePaymentCode } from "../../utils/generators.js";
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

export const getAllPayments = expressAsyncHandler(async (req, res) => {
  const {
    studentId,
    invoiceId,
    status,
    paymentMethod,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    order = "desc"
  } = req.query;

  const filter = {};
  if (studentId) filter.studentId = studentId;
  if (invoiceId) filter.invoiceId = invoiceId;
  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const sortOrder = order === "desc" ? -1 : 1;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate({
        path: "studentId",
        populate: {
          path: "userId",
          select: "fullName email"
        }
      })
      .populate("invoiceId", "invoiceCode month totalAmount")
      .populate("contractId", "contractCode")
      .populate("verifiedBy", "fullName")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum),
    Payment.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limitNum);

  successResponse(res, "Payments retrieved successfully", {
    payments,
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

export const getPaymentById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const payment = await Payment.findById(id)
    .populate({
      path: "studentId",
      populate: {
        path: "userId",
        select: "fullName email phoneNumber"
      }
    })
    .populate("invoiceId")
    .populate("contractId", "contractCode")
    .populate("verifiedBy", "fullName email")
    .populate("cashPayment.receivedBy", "fullName")
    .populate("refundInfo.refundedBy", "fullName");

  if (!payment) {
    return notFoundResponse(res, "Payment not found");
  }

  successResponse(res, "Payment retrieved successfully", { payment });
});

export const createPayment = expressAsyncHandler(async (req, res) => {
  const {
    invoiceId,
    amount,
    paymentMethod,
    gatewayTransactionId,
    bankTransfer,
    cashPayment,
    notes
  } = req.body;

  if (!invoiceId || !amount || amount <= 0) {
    return badRequestResponse(res, "Missing required fields: invoiceId, amount");
  }

  if (!paymentMethod) {
    return badRequestResponse(res, "Payment method is required");
  }

  const validMethods = ["bank_transfer", "momo", "vnpay", "zalopay", "cash", "other"];
  if (!validMethods.includes(paymentMethod)) {
    return badRequestResponse(res, `Invalid payment method. Must be one of: ${validMethods.join(", ")}`);
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    return notFoundResponse(res, "Invoice not found");
  }

  if (invoice.status === "paid") {
    return badRequestResponse(res, "Invoice is already fully paid");
  }

  if (invoice.status === "cancelled") {
    return badRequestResponse(res, "Cannot pay for cancelled invoice");
  }

  const remainingAmount = invoice.totalAmount - invoice.paidAmount;
  if (amount > remainingAmount) {
    return badRequestResponse(res, `Payment amount exceeds remaining balance. Remaining: ${remainingAmount}`);
  }

  const paymentCode = generatePaymentCode();

  const paymentData = {
    paymentCode,
    invoiceId,
    invoiceCode: invoice.invoiceCode,
    contractId: invoice.contractId,
    studentId: invoice.studentId,
    amount,
    paymentMethod,
    status: ["bank_transfer", "cash"].includes(paymentMethod) ? "pending" : "processing",
    gatewayTransactionId: gatewayTransactionId || null,
    bankTransfer: paymentMethod === "bank_transfer" ? bankTransfer : null,
    cashPayment: paymentMethod === "cash" ? {
      ...cashPayment,
      receivedBy: req.user._id
    } : null,
    notes,
    ipAddress: req.ip,
    userAgent: req.get("User-Agent")
  };

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payment = new Payment(paymentData);
    await payment.save({ session });

    if (paymentMethod === "momo" || paymentMethod === "vnpay" || paymentMethod === "zalopay") {
      payment.status = "processing";
      await payment.save({ session });
    }

    if (paymentMethod === "cash") {
      await payment.complete(req.user._id, "Cash payment received at office");
      await invoice.addPayment(amount);
    }

    await session.commitTransaction();

    createdResponse(res, "Payment created successfully", {
      payment: await Payment.findById(payment._id)
        .populate("invoiceId", "invoiceCode totalAmount paidAmount status")
        .populate("verifiedBy", "fullName")
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const verifyPayment = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { verificationNotes } = req.body;

  const payment = await Payment.findById(id);
  if (!payment) {
    return notFoundResponse(res, "Payment not found");
  }

  if (payment.status !== "pending") {
    return badRequestResponse(res, `Cannot verify payment with status: ${payment.status}`);
  }

  if (!["bank_transfer", "cash"].includes(payment.paymentMethod)) {
    return badRequestResponse(res, "Only bank transfer and cash payments need manual verification");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await payment.complete(req.user._id, verificationNotes || "Payment verified");

    const invoice = await Invoice.findById(payment.invoiceId);
    await invoice.addPayment(payment.amount);

    await payment.generateReceipt(req.user._id);

    await session.commitTransaction();

    successResponse(res, "Payment verified and completed successfully", {
      payment: await Payment.findById(id)
        .populate("invoiceId", "invoiceCode totalAmount paidAmount status")
        .populate("verifiedBy", "fullName")
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const rejectPayment = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const payment = await Payment.findById(id);
  if (!payment) {
    return notFoundResponse(res, "Payment not found");
  }

  if (payment.status !== "pending") {
    return badRequestResponse(res, `Cannot reject payment with status: ${payment.status}`);
  }

  await payment.fail(reason || "Payment rejected by admin");

  successResponse(res, "Payment rejected", { payment });
});

export const processOnlinePayment = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { gatewayResponse, status } = req.body;

  const payment = await Payment.findById(id);
  if (!payment) {
    return notFoundResponse(res, "Payment not found");
  }

  if (payment.status !== "processing" && payment.status !== "pending") {
    return badRequestResponse(res, `Cannot process payment with status: ${payment.status}`);
  }

  payment.gatewayResponse = gatewayResponse;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (status === "success") {
      payment.status = "completed";
      payment.paidAt = new Date();
      payment.completedAt = new Date();
      await payment.save({ session });

      const invoice = await Invoice.findById(payment.invoiceId);
      await invoice.addPayment(payment.amount);

      await payment.generateReceipt(null);
    } else {
      payment.status = "failed";
      await payment.save({ session });
    }

    await session.commitTransaction();

    successResponse(res, "Online payment processed", { payment });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const getMyPayments = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Student profile not found");
  }

  const { status, paymentMethod, page = 1, limit = 20 } = req.query;

  const options = {
    status,
    paymentMethod,
    page: parseInt(page),
    limit: parseInt(limit)
  };

  const payments = await Payment.findByStudent(student._id, options);

  successResponse(res, "My payments retrieved successfully", { payments });
});

export const getPendingVerifications = expressAsyncHandler(async (req, res) => {
  const pendingPayments = await Payment.findPendingVerification();

  successResponse(res, "Pending payment verifications", {
    count: pendingPayments.length,
    payments: pendingPayments
  });
});

export const refundPayment = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { refundAmount, reason, refundMethod, refundTransactionId } = req.body;

  const payment = await Payment.findById(id);
  if (!payment) {
    return notFoundResponse(res, "Payment not found");
  }

  if (payment.status !== "completed") {
    return badRequestResponse(res, `Cannot refund payment with status: ${payment.status}`);
  }

  if (!refundAmount || refundAmount <= 0 || refundAmount > payment.amount) {
    return badRequestResponse(res, "Valid refund amount is required");
  }

  await payment.refund({
    amount: refundAmount,
    reason: reason || "Refund",
    refundedBy: req.user._id,
    refundMethod: refundMethod || payment.paymentMethod,
    refundTransactionId: refundTransactionId || null
  });

  successResponse(res, "Payment refunded successfully", { payment });
});

export const getPaymentStats = expressAsyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const stats = await Payment.getPaymentStats(startDate, endDate);

  const today = new Date().toISOString().split("T")[0];
  const dailyRevenue = await Payment.getDailyRevenue(req.query.date || today);

  successResponse(res, "Payment statistics", {
    methodStats: stats,
    dailyRevenue
  });
});

export const generateReceipt = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const payment = await Payment.findById(id);
  if (!payment) {
    return notFoundResponse(res, "Payment not found");
  }

  if (payment.status !== "completed") {
    return badRequestResponse(res, "Cannot generate receipt for incomplete payment");
  }

  if (!payment.receipt || !payment.receipt.receiptCode) {
    await payment.generateReceipt(req.user._id);
  }

  successResponse(res, "Receipt generated", {
    receipt: payment.receipt,
    payment: await Payment.findById(id)
      .populate("studentId", "studentId")
      .populate("invoiceId", "invoiceCode")
  });
});

export const retryPayment = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const payment = await Payment.findById(id);
  if (!payment) {
    return notFoundResponse(res, "Payment not found");
  }

  if (payment.status !== "failed" && payment.status !== "pending") {
    return badRequestResponse(res, `Cannot retry payment with status: ${payment.status}`);
  }

  try {
    await payment.retry();
    successResponse(res, "Payment retry initiated", { payment });
  } catch (error) {
    return badRequestResponse(res, error.message);
  }
});
