/**
 * Registration Admin Controllers
 * Tất cả chức năng dành cho admin xử lý đơn đăng ký
 */

import RegistrationForm from "../../models/registration/registrationForm.model.js";
import RegistrationDocument from "../../models/registration/registrationDocument.model.js";
import RegistrationMissingDocument from "../../models/registration/registrationMissingDocument.model.js";
import User from "../../models/user/user.model.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
} from "../../utils/response.js";
import { logSecurityEvent } from "../../utils/security.logger.js";
import expressAsyncHandler from "express-async-handler";
import mongoose from "mongoose";
import {
  VALID_DOCUMENT_TYPES,
  DOCUMENT_TYPE_MAPPING,
  validateStep1,
  validateStep2,
  isValidStatusTransition,
  getMissingDocs,
} from "../../utils/registration.utils.js";

// ============ ADMIN: REQUEST MISSING DOCUMENTS ============

export const requestMissingDocuments = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { missingDocumentTypes, deadline, note } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  if (!Array.isArray(missingDocumentTypes) || missingDocumentTypes.length === 0) {
    return badRequestResponse(res, "missingDocumentTypes array is required");
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (!isValidStatusTransition(registrationForm.status, "missing_document")) {
    return badRequestResponse(res, `Cannot request missing documents for status: ${registrationForm.status}`);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const missingDocs = await Promise.all(
      missingDocumentTypes.map(type => {
        if (DOCUMENT_TYPE_MAPPING[type]) {
          registrationForm.requiredDocuments[DOCUMENT_TYPE_MAPPING[type]] = false;
        }

        return RegistrationMissingDocument.create([{
          registrationForm: id,
          documentType: type,
          note,
          isResolved: false
        }], { session });
      })
    );

    registrationForm.status = "missing_document";
    registrationForm.isMissingDocuments = true;
    registrationForm.isLocked = false;
    registrationForm.deadline = deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    registrationForm.resubmitCount += 1;

    await registrationForm.save({ session });
    await session.commitTransaction();

    successResponse(res, "Missing documents requested successfully", {
      registrationForm,
      missingDocuments: missingDocs.flat()
    });

  } catch (error) {
    await session.abortTransaction();
    errorResponse(res, error.message, 400);
  } finally {
    session.endSession();
  }
});

// ============ ADMIN: APPROVE REGISTRATION ============

export const approveRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (!isValidStatusTransition(registrationForm.status, "approved")) {
    return badRequestResponse(res, `Cannot approve form with status: ${registrationForm.status}`);
  }

  if (!registrationForm.requiredDocuments.stampedForm && !registrationForm.canSubmitWithoutStamp) {
    return badRequestResponse(res, "Cannot approve: stamped form is required but not uploaded");
  }

  const updatedForm = await RegistrationForm.findByIdAndUpdate(
    id,
    {
      status: "approved",
      approvedAt: new Date(),
      isLocked: true,
      approvalNotes: notes,
      approvedBy: req.user?._id
    },
    { new: true }
  ).populate("userId", "fullName email studentCode");

  successResponse(res, "Registration form approved successfully", updatedForm);
});

// ============ ADMIN: REJECT REGISTRATION ============

export const rejectRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  if (!rejectionReason) {
    return badRequestResponse(res, "rejectionReason is required");
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (!isValidStatusTransition(registrationForm.status, "rejected")) {
    return badRequestResponse(res, `Cannot reject form with status: ${registrationForm.status}`);
  }

  const updatedForm = await RegistrationForm.findByIdAndUpdate(
    id,
    {
      status: "rejected",
      rejectedAt: new Date(),
      rejectedBy: req.user._id,
      rejectionReason,
      isLocked: true
    },
    { new: true }
  );

  successResponse(res, "Registration form rejected successfully", {
    registrationForm: updatedForm,
    rejectionReason,
    rejectedAt: updatedForm.rejectedAt
  });
});

// ============ ADMIN: SAVE OFFLINE FORM DATA ============

export const adminSaveOfflineFormData = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { residenceData, temporaryData } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.status !== "received_offline") {
    return badRequestResponse(res, `Can only edit forms with status 'received_offline'. Current status: ${registrationForm.status}`);
  }

  const step1Errors = validateStep1(residenceData);
  if (step1Errors.length > 0) {
    return badRequestResponse(res, "Step 1 validation failed", { errors: step1Errors, step: 1 });
  }

  const step2Errors = validateStep2(temporaryData);
  if (step2Errors.length > 0) {
    return badRequestResponse(res, "Step 2 validation failed", { errors: step2Errors, step: 2 });
  }

  const temporaryContent = {
    ...temporaryData,
    ownerName: temporaryData.ownerName || "",
    ownerRelation: temporaryData.ownerRelation || "",
    ownerCccd: temporaryData.ownerCccd || ""
  };

  registrationForm.formData = {
    residence: residenceData,
    temporary: temporaryContent
  };

  if (!registrationForm.completedSteps.includes(1)) {
    registrationForm.completedSteps.push(1);
  }
  if (!registrationForm.completedSteps.includes(2)) {
    registrationForm.completedSteps.push(2);
  }
  registrationForm.currentStep = 3;

  await registrationForm.save();

  successResponse(res, "Offline form data saved successfully by admin", {
    registrationForm,
    nextStep: "Admin should now upload scanned documents (CCCD, Student Card, Stamped Form)"
  });
});

// ============ ADMIN: UPLOAD OFFLINE DOCUMENT ============

export const adminUploadOfflineDocument = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, fileUrl, note } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  if (!type || !fileUrl) {
    return badRequestResponse(res, "type and fileUrl are required");
  }

  if (!VALID_DOCUMENT_TYPES.includes(type)) {
    return badRequestResponse(res, `Invalid document type. Valid types: ${VALID_DOCUMENT_TYPES.join(", ")}`);
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.status !== "received_offline") {
    return badRequestResponse(res, `Can only upload documents for forms with status 'received_offline'. Current status: ${registrationForm.status}`);
  }

  const existingDoc = await RegistrationDocument.findOne({
    registrationForm: id,
    type
  });

  let document;
  if (existingDoc) {
    existingDoc.fileUrl = fileUrl;
    existingDoc.note = note;
    existingDoc.uploadedBy = "admin";
    document = await existingDoc.save();
  } else {
    document = new RegistrationDocument({
      registrationForm: id,
      type,
      fileUrl,
      note,
      uploadedBy: "admin",
      status: "verified"
    });
    await document.save();
  }

  if (DOCUMENT_TYPE_MAPPING[type]) {
    registrationForm.requiredDocuments[DOCUMENT_TYPE_MAPPING[type]] = true;
    await registrationForm.save();
  }

  const missingDocs = getMissingDocs(registrationForm.requiredDocuments);
  const canProceed = missingDocs.length === 0;

  successResponse(res, "Document uploaded successfully by admin", {
    document,
    canProceed,
    missingDocs,
    requiredDocuments: registrationForm.requiredDocuments,
    message: canProceed
      ? "All required documents uploaded. Ready to move to PROCESSING status."
      : "Please upload remaining required documents."
  });
});

// ============ ADMIN: MOVE TO PROCESSING ============

export const moveToProcessing = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.status !== "received_offline") {
    return badRequestResponse(res, `Can only move forms with status 'received_offline' to processing. Current status: ${registrationForm.status}`);
  }

  if (!registrationForm.completedSteps.includes(1) || !registrationForm.completedSteps.includes(2)) {
    return badRequestResponse(res, "Cannot move to processing: Step 1 and Step 2 data must be entered first");
  }

  const missingDocs = getMissingDocs(registrationForm.requiredDocuments);
  if (missingDocs.length > 0 || !registrationForm.requiredDocuments.stampedForm) {
    return badRequestResponse(res, "Cannot move to processing: All documents must be uploaded first", {
      missingDocuments: missingDocs,
      stampedFormMissing: !registrationForm.requiredDocuments.stampedForm
    });
  }

  const updatedForm = await RegistrationForm.findByIdAndUpdate(
    id,
    {
      status: "processing",
      processingStartedAt: new Date(),
      processingNote: note || "",
      processedBy: req.user._id,
      isLocked: true
    },
    { new: true }
  ).populate("userId", "fullName email studentCode phone address");

  successResponse(res, "Form moved to processing status", {
    registrationForm: updatedForm,
    nextStep: "Review and approve/reject the application"
  });
});

// ============ ADMIN: MARK OFFLINE FORM RECEIVED ============

export const markOfflineFormReceived = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { receivedBy, receivedAt, note } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.status !== "pending_offline") {
    return badRequestResponse(res, `Can only mark forms with status 'pending_offline' as received. Current status: ${registrationForm.status}`);
  }

  const updatedForm = await RegistrationForm.findByIdAndUpdate(
    id,
    {
      status: "received_offline",
      receivedAt: receivedAt || new Date(),
      receivedBy: receivedBy || req.user._id,
      receivedNote: note || "",
      isLocked: false
    },
    { new: true }
  ).populate("userId", "fullName email studentCode phone address");

  successResponse(res, "Offline form marked as received", {
    registrationForm: updatedForm,
    nextStep: "Admin should now enter form data (Step 1 & 2) and upload scanned documents",
    note: "Paper documents received in person. Admin needs to input data into system."
  });
});

// ============ ADMIN: ASSIGN USER TO FORM ============

export const assignUserToRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId, verifyInfo } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  if (!userId) {
    return badRequestResponse(res, "userId is required");
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  const user = await User.findById(userId);
  if (!user) {
    return errorResponse(res, "User not found", 404);
  }

  const previousUserId = registrationForm.userId;
  registrationForm.userId = userId;
  await registrationForm.save();

  const updatedForm = await RegistrationForm.findById(id)
    .populate("userId", "fullName email studentCode phone address");

  successResponse(res, "User assigned to form successfully", {
    registrationForm: updatedForm,
    previousUserId: previousUserId || null,
    newUser: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      studentCode: user.studentCode
    },
    note: previousUserId
      ? "Form was reassigned to a different user"
      : "Form was previously unassigned and is now linked"
  });
});

// ============ ADMIN: CONFIRM SINGLE FORM ============

export const adminConfirmSingleForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.status !== "submitted") {
    return badRequestResponse(res, `Chỉ có thể xác nhận đơn ở trạng thái 'submitted'. Hiện tại: ${registrationForm.status}`);
  }

  const updatedForm = await RegistrationForm.findByIdAndUpdate(
    id,
    {
      status: "pending",
      confirmedAt: new Date(),
      confirmedBy: req.user._id,
      confirmationNote: note || "Xác nhận hồ sơ để kiểm tra"
    },
    { new: true }
  ).populate("userId", "fullName email studentCode phone");

  successResponse(res, "Xác nhận đơn thành công - đơn đã chuyển sang trạng thái chờ kiểm tra", {
    registrationForm: updatedForm,
    previousStatus: "submitted",
    newStatus: "pending"
  });
});

// ============ ADMIN: BATCH CONFIRM FORMS ============

export const adminConfirmForms = expressAsyncHandler(async (req, res) => {
  const { formIds, confirmAll = false } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  let formsToProcess = [];

  if (confirmAll) {
    formsToProcess = await RegistrationForm.find({
      status: "submitted"
    }).select("_id status registrationFormCode");
  } else if (formIds && formIds.length > 0) {
    formsToProcess = await RegistrationForm.find({
      _id: { $in: formIds },
      status: "submitted"
    }).select("_id status registrationFormCode");
  } else {
    return badRequestResponse(res, "Vui lòng cung cấp formIds hoặc confirmAll = true");
  }

  if (formsToProcess.length === 0) {
    return successResponse(res, "Không có đơn nào cần xác nhận", {
      confirmedCount: 0,
      confirmedForms: []
    });
  }

  const confirmedForms = [];
  const failedForms = [];

  for (const form of formsToProcess) {
    try {
      const updatedForm = await RegistrationForm.findByIdAndUpdate(
        form._id,
        {
          status: "pending",
          confirmedAt: new Date(),
          confirmedBy: req.user._id,
          confirmationNote: "Xác nhận hồ sơ để kiểm tra"
        },
        { new: true }
      );

      confirmedForms.push({
        formId: form._id,
        formCode: form.registrationFormCode,
        newStatus: "pending"
      });
    } catch (error) {
      failedForms.push({
        formId: form._id,
        formCode: form.registrationFormCode,
        error: error.message
      });
    }
  }

  successResponse(res, `Đã xác nhận ${confirmedForms.length} đơn để kiểm tra`, {
    confirmedCount: confirmedForms.length,
    failedCount: failedForms.length,
    confirmedForms,
    failedForms: failedForms.length > 0 ? failedForms : undefined
  });
});

// ============ ADMIN: CHECK OVERDUE FORMS ============

export const adminCheckOverdueForms = expressAsyncHandler(async (req, res) => {
  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  const now = new Date();

  const overdueForms = await RegistrationForm.find({
    stampedFormDeadline: { $lt: now },
    "requiredDocuments.stampedForm": false,
    status: { $in: ["submitted", "pending", "missing_document"] }
  });

  const rejectedForms = [];

  for (const form of overdueForms) {
    try {
      await RegistrationForm.findByIdAndUpdate(
        form._id,
        {
          status: "rejected",
          rejectedAt: new Date(),
          rejectionReason: "Quá hạn nộp đơn có dấu xác nhận",
          isLocked: true
        }
      );

      rejectedForms.push({
        formId: form._id,
        formCode: form.registrationFormCode,
        deadline: form.stampedFormDeadline,
        daysOverdue: Math.ceil((now - form.stampedFormDeadline) / (1000 * 60 * 60 * 24))
      });
    } catch (error) {
      console.error(`Failed to reject form ${form._id}:`, error.message);
    }
  }

  successResponse(res, `Đã kiểm tra và từ chối ${rejectedForms.length} đơn quá hạn`, {
    checkedCount: overdueForms.length,
    rejectedCount: rejectedForms.length,
    rejectedForms
  });
});

// ============ ADMIN: REVIEW DOCUMENTS ============

export const adminReviewDocuments = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { decision, missingDocuments = [], rejectionReason = "" } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  if (!["approve", "missing_document", "reject"].includes(decision)) {
    return badRequestResponse(res, "Decision phải là: approve | missing_document | reject");
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.status !== "pending") {
    return badRequestResponse(res, `Chỉ được review form ở trạng thái 'pending'. Hiện tại: ${registrationForm.status}`);
  }

  const now = new Date();
  const isOverdue = registrationForm.stampedFormDeadline &&
    now > registrationForm.stampedFormDeadline &&
    !registrationForm.requiredDocuments.stampedForm;

  if (isOverdue) {
    const updatedForm = await RegistrationForm.findByIdAndUpdate(
      id,
      {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: req.user._id,
        rejectionReason: "Quá hạn nộp đơn có dấu xác nhận",
        isLocked: true
      },
      { new: true }
    );

    return successResponse(res, "Form đã bị từ chối do quá hạn", {
      registrationForm: updatedForm,
      reason: "Quá hạn nộp đơn có dấu xác nhận",
      deadline: registrationForm.stampedFormDeadline,
      daysOverdue: Math.ceil((now - registrationForm.stampedFormDeadline) / (1000 * 60 * 60 * 24))
    });
  }

  if (decision === "approve") {
    const docs = registrationForm.requiredDocuments;
    const requiredDocs = ["cccdFront", "cccdBack", "studentCard", "stampedForm"];
    const missingRequiredDocs = requiredDocs.filter(doc => !docs[doc]);

    if (missingRequiredDocs.length > 0) {
      return badRequestResponse(res, "Không thể duyệt: Thiếu tài liệu", {
        missingDocuments: missingRequiredDocs,
        suggestion: "Sử dụng decision = 'missing_document' để yêu cầu bổ sung"
      });
    }

    const updatedForm = await RegistrationForm.findByIdAndUpdate(
      id,
      {
        status: "approved",
        approvedAt: new Date(),
        approvedBy: req.user._id,
        isLocked: true,
        approvalNotes: "Đã kiểm tra đầy đủ tài liệu"
      },
      { new: true }
    );

    return successResponse(res, "Đã phê duyệt đơn đăng ký", {
      registrationForm: updatedForm,
      decision: "approve",
      approvedAt: updatedForm.approvedAt
    });

  } else if (decision === "missing_document") {
    if (missingDocuments.length === 0) {
      return badRequestResponse(res, "Vui lòng chỉ định tài liệu còn thiếu");
    }

    const updatedForm = await RegistrationForm.findByIdAndUpdate(
      id,
      {
        status: "missing_document",
        missingDocumentNote: `Thiếu tài liệu: ${missingDocuments.join(", ")}`,
        resubmitDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isLocked: false
      },
      { new: true }
    );

    for (const docType of missingDocuments) {
      await RegistrationMissingDocument.create({
        registrationForm: id,
        documentType: docType,
        reason: "Thiếu tài liệu trong quá trình kiểm tra",
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    }

    return successResponse(res, "Đã chuyển sang trạng thái thiếu tài liệu", {
      registrationForm: updatedForm,
      decision: "missing_document",
      missingDocuments,
      resubmitDeadline: updatedForm.resubmitDeadline
    });

  } else if (decision === "reject") {
    if (!rejectionReason) {
      return badRequestResponse(res, "Vui lòng cung cấp lý do từ chối");
    }

    const updatedForm = await RegistrationForm.findByIdAndUpdate(
      id,
      {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: req.user._id,
        rejectionReason,
        isLocked: true
      },
      { new: true }
    );

    return successResponse(res, "Đã từ chối đơn đăng ký", {
      registrationForm: updatedForm,
      decision: "reject",
      rejectionReason,
      rejectedAt: updatedForm.rejectedAt
    });
  }
});

// ============ ADMIN: DASHBOARD STATS ============

export const getAdminStats = expressAsyncHandler(async (req, res) => {
  const { period = "30d" } = req.query;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  const getStartDate = () => {
    const now = new Date();
    switch (period) {
      case "7d": return new Date(now - 7 * 24 * 60 * 60 * 1000);
      case "30d": return new Date(now - 30 * 24 * 60 * 60 * 1000);
      case "90d": return new Date(now - 90 * 24 * 60 * 60 * 1000);
      case "1y": return new Date(now - 365 * 24 * 60 * 60 * 1000);
      default: return new Date(now - 30 * 24 * 60 * 60 * 1000);
    }
  };

  const startDate = getStartDate();

  const statusStats = await RegistrationForm.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);

  const statusMap = {
    draft: 0, submitted: 0, pending: 0, processing: 0,
    missing_document: 0, resubmitted: 0, approved: 0,
    rejected: 0, pending_offline: 0, received_offline: 0
  };
  statusStats.forEach(s => statusMap[s._id] = s.count);

  const dailyStats = await RegistrationForm.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        submitted: { $sum: { $cond: [{ $gte: ["$currentStep", 4] }, 1, 0] } },
        drafts: { $sum: { $cond: [{ $lt: ["$currentStep", 4] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const adminActions = await RegistrationForm.aggregate([
    {
      $match: {
        $or: [
          { confirmedAt: { $gte: startDate } },
          { approvedAt: { $gte: startDate } },
          { rejectedAt: { $gte: startDate } }
        ]
      }
    },
    {
      $group: {
        _id: null,
        confirmed: { $sum: { $cond: [{ $gte: ["$confirmedAt", startDate] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $gte: ["$approvedAt", startDate] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $gte: ["$rejectedAt", startDate] }, 1, 0] } }
      }
    }
  ]);

  const attentionNeeded = await RegistrationForm.countDocuments({
    $or: [
      { status: "missing_document", resubmitDeadline: { $lt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) } },
      { status: "submitted", createdAt: { $lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
      { status: "pending", createdAt: { $lt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } }
    ]
  });

  const districtStats = await RegistrationForm.aggregate([
    { $match: { "formData.residence.district": { $exists: true } } },
    { $group: { _id: "$formData.residence.district", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  const completionRate = await RegistrationForm.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $in: ["$status", ["approved", "rejected"]] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } }
      }
    }
  ]);

  const stats = completionRate[0] || { total: 0, completed: 0, approved: 0 };

  successResponse(res, "Admin dashboard stats", {
    period,
    startDate,
    summary: {
      totalForms: stats.total,
      completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      approvalRate: stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0,
      attentionNeeded
    },
    byStatus: {
      draft: statusMap.draft,
      active: statusMap.submitted + statusMap.pending + statusMap.processing +
        statusMap.missing_document + statusMap.resubmitted +
        statusMap.pending_offline + statusMap.received_offline,
      approved: statusMap.approved,
      rejected: statusMap.rejected
    },
    detailedStatus: statusMap,
    dailyTrends: dailyStats,
    adminPerformance: adminActions[0] || { confirmed: 0, approved: 0, rejected: 0 },
    topDistricts: districtStats,
    urgent: {
      missingDocumentSoon: await RegistrationForm.countDocuments({
        status: "missing_document",
        resubmitDeadline: { $lt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), $gte: new Date() }
      }),
      overdueReview: await RegistrationForm.countDocuments({
        status: { $in: ["submitted", "pending"] },
        createdAt: { $lt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
      }),
      needsStampedForm: await RegistrationForm.countDocuments({
        "requiredDocuments.stampedForm": false,
        status: { $in: ["submitted", "pending", "missing_document"] },
        stampedFormDeadline: { $lt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) }
      })
    }
  });
});
