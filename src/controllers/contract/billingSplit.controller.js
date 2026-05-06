import RoomBillingSplit from "../../models/contract/roomBillingSplit.model.js";
import StudentBill from "../../models/contract/studentBill.model.js";
import Room from "../../models/building/room.model.js";
import Student from "../../models/user/student.model.js";
import Invoice from "../../models/contract/invoice.model.js";
import Contract from "../../models/contract/contract.model.js";
import { generateInvoiceCode } from "../../utils/generators.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  notFoundResponse,
  createdResponse
} from "../../utils/response.js";
import expressAsyncHandler from "express-async-handler";

export const getBillingSplitByRoom = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;

  const billingSplit = await RoomBillingSplit.findByRoom(roomId);
  if (!billingSplit) {
    return notFoundResponse(res, "Billing split configuration not found for this room");
  }

  successResponse(res, "Billing split retrieved", { billingSplit });
});

export const createBillingSplit = expressAsyncHandler(async (req, res) => {
  const { roomId, contractId, studentIds, options = {} } = req.body;

  if (!roomId || !contractId || !studentIds || !Array.isArray(studentIds)) {
    return badRequestResponse(res, "Missing required fields: roomId, contractId, studentIds");
  }

  const room = await Room.findById(roomId).populate("assignedStudents.studentId");
  if (!room) {
    return notFoundResponse(res, "Room not found");
  }

  const contract = await Contract.findById(contractId);
  if (!contract) {
    return notFoundResponse(res, "Contract not found");
  }

  // Verify all students are in the room
  const roomStudentIds = room.assignedStudents.map(s => s.studentId.toString());
  const validStudents = studentIds.every(id => roomStudentIds.includes(id));

  if (!validStudents) {
    return badRequestResponse(res, "Some students are not assigned to this room");
  }

  const billingSplit = await RoomBillingSplit.createForRoom(
    roomId,
    contractId,
    studentIds,
    req.user._id,
    options
  );

  createdResponse(res, "Billing split created", {
    billingSplit: await RoomBillingSplit.findById(billingSplit._id)
      .populate("studentShares.studentId", "studentId")
  });
});

export const updateSplitConfig = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { itemType, splitMethod, customRatios } = req.body;

  const billingSplit = await RoomBillingSplit.findOne({ roomId, isActive: true });
  if (!billingSplit) {
    return notFoundResponse(res, "Billing split not found");
  }

  await billingSplit.updateSplitConfig(itemType, splitMethod, customRatios);

  successResponse(res, "Split configuration updated", { billingSplit });
});

export const addStudentToSplit = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { studentId, percentage } = req.body;

  const billingSplit = await RoomBillingSplit.findOne({ roomId, isActive: true });
  if (!billingSplit) {
    return notFoundResponse(res, "Billing split not found");
  }

  // Verify student is in the room
  const room = await Room.findById(roomId);
  const isInRoom = room.assignedStudents.some(
    s => s.studentId.toString() === studentId
  );

  if (!isInRoom) {
    return badRequestResponse(res, "Student is not assigned to this room");
  }

  await billingSplit.addStudent(studentId, percentage);

  successResponse(res, "Student added to billing split", {
    billingSplit: await RoomBillingSplit.findByRoom(roomId)
  });
});

export const removeStudentFromSplit = expressAsyncHandler(async (req, res) => {
  const { roomId, studentId } = req.params;

  const billingSplit = await RoomBillingSplit.findOne({ roomId, isActive: true });
  if (!billingSplit) {
    return notFoundResponse(res, "Billing split not found");
  }

  await billingSplit.removeStudent(studentId);

  successResponse(res, "Student removed from billing split", {
    billingSplit: await RoomBillingSplit.findByRoom(roomId)
  });
});

export const setPrimaryPayer = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { studentId } = req.body;

  const billingSplit = await RoomBillingSplit.findOne({ roomId, isActive: true });
  if (!billingSplit) {
    return notFoundResponse(res, "Billing split not found");
  }

  // Verify student is in the split
  const isInSplit = billingSplit.studentShares.some(
    s => s.studentId.toString() === studentId && s.isActive
  );

  if (!isInSplit) {
    return badRequestResponse(res, "Student is not in the billing split");
  }

  billingSplit.primaryPayerId = studentId;
  billingSplit.updatedBy = req.user._id;
  await billingSplit.save();

  successResponse(res, "Primary payer updated", { billingSplit });
});

export const calculateSplitPreview = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { invoiceItems } = req.body;

  const billingSplit = await RoomBillingSplit.findOne({ roomId, isActive: true })
    .populate("studentShares.studentId", "studentId userId")
    .populate({
      path: "studentShares.studentId",
      populate: { path: "userId", select: "fullName" }
    });

  if (!billingSplit) {
    return notFoundResponse(res, "Billing split not found");
  }

  const room = await Room.findById(roomId);
  const occupants = room.currentOccupancy || billingSplit.studentShares.filter(s => s.isActive).length;

  const splitResult = billingSplit.calculateSplit(invoiceItems, occupants);

  successResponse(res, "Split calculation preview", {
    roomId,
    totalOccupants: occupants,
    splitResult
  });
});

export const getStudentBills = expressAsyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { status, page = 1, limit = 20 } = req.query;

  const options = { status, page: parseInt(page), limit: parseInt(limit) };
  const bills = await StudentBill.findByStudent(studentId, options);

  const balance = await StudentBill.getStudentBalance(studentId);

  successResponse(res, "Student bills retrieved", {
    bills,
    balance,
    totalCount: bills.length
  });
});

export const getMyBills = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  const student = await Student.findOne({ userId });
  if (!student) {
    return notFoundResponse(res, "Student profile not found");
  }

  const { status, page = 1, limit = 20 } = req.query;

  const options = { status, page: parseInt(page), limit: parseInt(limit) };
  const bills = await StudentBill.findByStudent(student._id, options);

  const pendingBills = bills.filter(b => ["pending", "partial", "overdue"].includes(b.status));
  const totalDue = pendingBills.reduce((sum, b) => sum + (b.totalAmount - b.paidAmount), 0);

  const balance = await StudentBill.getStudentBalance(student._id);

  successResponse(res, "My bills retrieved", {
    bills,
    summary: {
      totalPending: pendingBills.length,
      totalDue,
      ...balance
    }
  });
});

export const getStudentBillById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const bill = await StudentBill.findById(id)
    .populate("studentId", "studentId userId")
    .populate({
      path: "studentId",
      populate: { path: "userId", select: "fullName email" }
    })
    .populate("invoiceId", "invoiceCode month totalAmount")
    .populate("roomId", "roomCode")
    .populate("splitConfigId");

  if (!bill) {
    return notFoundResponse(res, "Student bill not found");
  }

  successResponse(res, "Student bill retrieved", { bill });
});

export const payStudentBill = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, paymentMethod } = req.body;

  if (!amount || amount <= 0) {
    return badRequestResponse(res, "Valid amount is required");
  }

  const bill = await StudentBill.findById(id);
  if (!bill) {
    return notFoundResponse(res, "Student bill not found");
  }

  const remaining = bill.totalAmount - bill.paidAmount;
  if (amount > remaining) {
    return badRequestResponse(res, `Amount exceeds remaining balance. Remaining: ${remaining}`);
  }

  // Create a mock payment ID for now - in real implementation this would link to actual Payment model
  const paymentId = `PAY${Date.now()}`;

  await bill.addPayment(amount, paymentId, paymentMethod || "bank_transfer");

  successResponse(res, "Payment recorded", {
    bill: await StudentBill.findById(id)
      .populate("studentId", "studentId")
      .populate("invoiceId", "invoiceCode")
  });
});

export const splitExistingInvoice = expressAsyncHandler(async (req, res) => {
  const { invoiceId } = req.body;

  const invoice = await Invoice.findById(invoiceId)
    .populate("roomId", "currentOccupancy assignedStudents")
    .populate("contractId");

  if (!invoice) {
    return notFoundResponse(res, "Invoice not found");
  }

  // Check if already split
  const existingBills = await StudentBill.countDocuments({ invoiceId });
  if (existingBills > 0) {
    return badRequestResponse(res, "Invoice has already been split into student bills");
  }

  const billingSplit = await RoomBillingSplit.findOne({
    roomId: invoice.roomId._id,
    isActive: true
  });

  if (!billingSplit) {
    return notFoundResponse(res, "No billing split configuration found for this room");
  }

  const occupants = invoice.roomId.currentOccupancy || billingSplit.studentShares.filter(s => s.isActive).length;
  const splitResult = billingSplit.calculateSplit(invoice.items, occupants);

  const createdBills = [];
  const year = invoice.month.split("-")[0];
  const month = invoice.month.split("-")[1];

  for (const studentId in splitResult) {
    const split = splitResult[studentId];

    const billCode = `STU${year}${month}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

    const bill = new StudentBill({
      billCode,
      invoiceId: invoice._id,
      invoiceCode: invoice.invoiceCode,
      parentInvoiceMonth: invoice.month,
      studentId: split.studentId,
      roomId: invoice.roomId._id,
      contractId: invoice.contractId._id,
      items: split.items.map(item => ({
        type: item.type,
        description: item.description,
        originalAmount: item.originalAmount,
        splitMethod: item.splitMethod,
        amount: item.amount,
        percentage: item.percentage,
        usage: item.usage || null,
        unitPrice: item.unitPrice || null,
        ratio: item.ratio || null
      })),
      subTotal: split.subTotal,
      discount: 0,
      totalAmount: split.total,
      paidAmount: 0,
      remainingAmount: split.total,
      status: "pending",
      dueDate: invoice.dueDate,
      splitConfigId: billingSplit._id,
      percentageOfTotal: split.percentage,
      generatedBy: req.user._id
    });

    await bill.save();
    createdBills.push(bill);
  }

  successResponse(res, "Invoice split successfully", {
    invoiceId,
    totalBillsCreated: createdBills.length,
    bills: createdBills.map(b => ({
      billId: b._id,
      billCode: b.billCode,
      studentId: b.studentId,
      totalAmount: b.totalAmount,
      percentage: b.percentageOfTotal
    }))
  });
});

export const getRoomBillSummary = expressAsyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { month } = req.query;

  const query = { roomId };
  if (month) query.parentInvoiceMonth = month;

  const bills = await StudentBill.find(query)
    .populate("studentId", "studentId userId")
    .populate({
      path: "studentId",
      populate: { path: "userId", select: "fullName" }
    })
    .sort({ generatedAt: -1 });

  const summary = {
    totalBills: bills.length,
    totalAmount: bills.reduce((sum, b) => sum + b.totalAmount, 0),
    totalPaid: bills.reduce((sum, b) => sum + b.paidAmount, 0),
    totalRemaining: bills.reduce((sum, b) => sum + (b.totalAmount - b.paidAmount), 0),
    byStatus: {}
  };

  for (const bill of bills) {
    if (!summary.byStatus[bill.status]) {
      summary.byStatus[bill.status] = { count: 0, amount: 0 };
    }
    summary.byStatus[bill.status].count++;
    summary.byStatus[bill.status].amount += bill.totalAmount;
  }

  successResponse(res, "Room bill summary", {
    roomId,
    month,
    summary,
    bills
  });
});
