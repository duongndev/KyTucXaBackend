import RegistrationForm from "../models/registration/registrationForm.model.js";
import RegistrationDocument from "../models/registration/registrationDocument.model.js";
import RegistrationMissingDocument from "../models/registration/registrationMissingDocument.model.js";
import { generateRegistrationCode } from "../utils/generateCode.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  createdResponse,
} from "../utils/response.js";
import expressAsyncHandler from "express-async-handler";
import mongoose from "mongoose";
import {
  ALLOWED_STATUS_TRANSITIONS,
  VALID_DOCUMENT_TYPES,
  DOCUMENT_TYPE_MAPPING,
  validateStep1,
  validateStep2,
  validateAllSteps,
  getMissingDocs,
  canSubmitForm,
  isValidStatusTransition,
  buildPaginationResponse
} from "../utils/registration.utils.js";

const checkAndResolveMissingDocument = async (formId, docType, documentId) => {
  const missingDoc = await RegistrationMissingDocument.findOne({
    registrationForm: formId,
    documentType: docType,
    isResolved: false
  });

  if (missingDoc) {
    missingDoc.isResolved = true;
    missingDoc.resolvedDocument = documentId;
    missingDoc.resolvedAt = new Date();
    await missingDoc.save();

    const unresolvedCount = await RegistrationMissingDocument.countDocuments({
      registrationForm: formId,
      isResolved: false
    });

    if (unresolvedCount === 0) {
      await RegistrationForm.findByIdAndUpdate(formId, {
        isMissingDocuments: false,
        status: "resubmitted"
      });
    }
  }
};

// ============ FORM CREATION ============

export const createRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { userId, submissionType = "online" } = req.body;
  const currentUser = req.user;

  if (!userId) {
    return badRequestResponse(res, "User ID is required");
  }

  const registrationFormCode = generateRegistrationCode();

  const registrationForm = new RegistrationForm({
    registrationFormCode,
    userId: currentUser.role === 'admin' ? userId : currentUser._id,
    submissionType,
    formData: { residence: {}, temporary: {} },
    status: "draft",
    currentStep: 1,
    completedSteps: [],
    isMissingDocuments: false,
    resubmitCount: 0,
    requiredDocuments: {
      cccdFront: false,
      cccdBack: false,
      studentCard: false,
      priorityDoc: false,
      stampedForm: false
    },
    canSubmitWithoutStamp: true
  });

  await registrationForm.save();
  createdResponse(res, "Registration form created successfully", registrationForm);
});

// ============ STEP 1: NỘI TRÚ ============

export const saveStep1 = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { residenceData } = req.body;

  const registrationForm = await RegistrationForm.findById(id);

  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.status !== "draft") {
    return badRequestResponse(res, "Cannot edit non-draft form");
  }

  const errors = validateStep1(residenceData);
  if (errors.length > 0) {
    return badRequestResponse(res, "Validation failed", { errors, step: 1 });
  }

  registrationForm.formData = {
    ...registrationForm.formData,
    residence: residenceData
  };
  
  registrationForm.currentStep = 2;
  if (!registrationForm.completedSteps.includes(1)) {
    registrationForm.completedSteps.push(1);
  }

  await registrationForm.save();

  successResponse(res, "Step 1 saved successfully", {
    registrationForm,
    nextStep: 2
  });
});

// ============ STEP 2: TẠM TRÚ ============

export const saveStep2 = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { temporaryData } = req.body;

  const registrationForm = await RegistrationForm.findById(id);

  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.status !== "draft") {
    return badRequestResponse(res, "Cannot edit non-draft form");
  }

  const errors = validateStep2(temporaryData);
  if (errors.length > 0) {
    return badRequestResponse(res, "Validation failed", { errors, step: 2 });
  }

  const temporaryConten = {
    ...temporaryData,
    ownerName: "",
    ownerRelation: "",
    ownerCccd: ""
  };

  registrationForm.formData = {
    ...registrationForm.formData,
    temporary: temporaryConten
  };
  
  registrationForm.currentStep = 3;
  if (!registrationForm.completedSteps.includes(2)) {
    registrationForm.completedSteps.push(2);
  }

  await registrationForm.save();

  successResponse(res, "Step 2 saved successfully", {
    registrationForm,
    nextStep: 3
  });
});

// ============ STEP 3: UPLOAD DOCUMENTS ============

export const uploadDocument = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, fileUrl, note } = req.body;

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

  if (!["draft", "submitted", "missing_document"].includes(registrationForm.status)) {
    return badRequestResponse(res, "Cannot upload documents at this stage");
  }

  const existingDoc = await RegistrationDocument.findOne({
    registrationForm: id,
    type
  });

  let document;
  if (existingDoc) {
    existingDoc.fileUrl = fileUrl;
    existingDoc.note = note;
    existingDoc.status = "pending";
    document = await existingDoc.save();
  } else {
    document = new RegistrationDocument({
      registrationForm: id,
      type,
      fileUrl,
      note,
      uploadedBy: "student",
      status: "pending"
    });
    await document.save();
  }

  if (DOCUMENT_TYPE_MAPPING[type]) {
    registrationForm.requiredDocuments[DOCUMENT_TYPE_MAPPING[type]] = true;
    
    if (type === 'stamped_form' && registrationForm.status === 'missing_document') {
      await checkAndResolveMissingDocument(id, 'stamped_form', document._id);
    }
    
    await registrationForm.save();
  }

  const canSubmit = canSubmitForm(registrationForm.requiredDocuments);
  const missingDocs = getMissingDocs(registrationForm.requiredDocuments);

  if (canSubmit && registrationForm.currentStep === 3) {
    registrationForm.currentStep = 4;
    if (!registrationForm.completedSteps.includes(3)) {
      registrationForm.completedSteps.push(3);
    }
    await registrationForm.save();
  }

  successResponse(res, "Document uploaded successfully", {
    document,
    canSubmit,
    missingDocs,
    requiredDocuments: registrationForm.requiredDocuments,
    currentStep: registrationForm.currentStep
  });
});

// ============ STEP 4: SUBMIT WITH TRANSACTION ============

export const submitRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { signature } = req.body;

  const registrationForm = await RegistrationForm.findById(id);

  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (registrationForm.isLocked) {
    return badRequestResponse(res, "Registration form is already locked");
  }

  if (!isValidStatusTransition(registrationForm.status, "submitted")) {
    return badRequestResponse(res, `Cannot submit form with status: ${registrationForm.status}`);
  }

  const allErrors = validateAllSteps(registrationForm.formData);
  if (allErrors.length > 0) {
    return badRequestResponse(res, "Form incomplete", { 
      errors: allErrors,
      message: "Vui lòng hoàn thành tất cả các bước trước khi nộp"
    });
  }

  const missingDocs = getMissingDocs(registrationForm.requiredDocuments);
  if (missingDocs.length > 0) {
    return badRequestResponse(res, "Missing required documents", {
      missingDocuments: missingDocs,
      message: `Thiếu các tài liệu bắt buộc: ${missingDocs.join(", ")}`
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const lockedForm = await RegistrationForm.findOneAndUpdate(
      { _id: id, status: "draft", isLocked: { $ne: true } },
      { 
        isLocked: true,
        status: "submitted",
        submittedAt: new Date(),
        signature: signature,
        currentStep: 4
      },
      { session, new: true }
    );

    if (!lockedForm) {
      throw new Error("Form already submitted or locked by another request");
    }

    if (!lockedForm.completedSteps.includes(3)) {
      lockedForm.completedSteps.push(3);
    }
    if (!lockedForm.completedSteps.includes(4)) {
      lockedForm.completedSteps.push(4);
    }

    if (!lockedForm.requiredDocuments.stampedForm) {
      lockedForm.stampedFormDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }

    await lockedForm.save({ session });
    await session.commitTransaction();

    successResponse(res, "Registration form submitted successfully", {
      registrationForm: lockedForm,
      needStampedForm: !lockedForm.requiredDocuments.stampedForm,
      stampedFormDeadline: lockedForm.stampedFormDeadline,
      message: lockedForm.requiredDocuments.stampedForm 
        ? "Hồ sơ đã được nộp thành công"
        : "Hồ sơ đã được nộp. Vui lòng upload đơn có dấu xác nhận trong vòng 7 ngày"
    });

  } catch (error) {
    await session.abortTransaction();
    errorResponse(res, error.message, 400);
  } finally {
    session.endSession();
  }
});

// ============ UPLOAD STAMPED FORM AFTER SUBMIT ============

export const uploadStampedForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fileUrl, note } = req.body;

  if (!fileUrl) {
    return badRequestResponse(res, "fileUrl is required");
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (!["submitted", "pending", "missing_document"].includes(registrationForm.status)) {
    return badRequestResponse(res, "Cannot upload stamped document at this stage");
  }

  if (registrationForm.stampedFormDeadline && new Date() > registrationForm.stampedFormDeadline) {
    return badRequestResponse(res, "Đã quá hạn upload đơn có dấu xác nhận");
  }

  const existingDoc = await RegistrationDocument.findOne({
    registrationForm: id,
    type: "stamped_form"
  });

  let document;
  if (existingDoc) {
    existingDoc.fileUrl = fileUrl;
    existingDoc.note = note;
    existingDoc.status = "pending";
    document = await existingDoc.save();
  } else {
    document = new RegistrationDocument({
      registrationForm: id,
      type: "stamped_form",
      fileUrl,
      note,
      uploadedBy: "student",
      status: "pending"
    });
    await document.save();
  }

  registrationForm.requiredDocuments.stampedForm = true;

  if (registrationForm.status === "missing_document") {
    const missingDoc = await RegistrationMissingDocument.findOne({
      registrationForm: id,
      documentType: "stamped_form",
      isResolved: false
    });

    if (missingDoc) {
      missingDoc.isResolved = true;
      missingDoc.resolvedDocument = document._id;
      missingDoc.resolvedAt = new Date();
      await missingDoc.save();

      const unresolvedCount = await RegistrationMissingDocument.countDocuments({
        registrationForm: id,
        isResolved: false
      });

      if (unresolvedCount === 0) {
        registrationForm.isMissingDocuments = false;
        registrationForm.status = "resubmitted";
      }
    }
  }

  await registrationForm.save();

  successResponse(res, "Stamped form uploaded successfully", {
    document,
    formStatus: registrationForm.status,
    message: "Đơn có dấu đã được upload thành công"
  });
});

// ============ GET STATUS & PROGRESS ============

export const getRegistrationStatus = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const registrationForm = await RegistrationForm.findById(id)
    .populate("userId", "fullName email studentCode phone");

  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  const documents = await RegistrationDocument.find({ registrationForm: id })
    .sort({ createdAt: -1 });

  const missingDocuments = await RegistrationMissingDocument.find({
    registrationForm: id,
    isResolved: false
  });

  let stampedFormStatus = null;
  if (!registrationForm.requiredDocuments.stampedForm && registrationForm.stampedFormDeadline) {
    const daysRemaining = Math.ceil(
      (registrationForm.stampedFormDeadline - Date.now()) / (1000 * 60 * 60 * 24)
    );
    stampedFormStatus = {
      uploaded: false,
      deadline: registrationForm.stampedFormDeadline,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      isOverdue: daysRemaining < 0
    };
  } else if (registrationForm.requiredDocuments.stampedForm) {
    stampedFormStatus = { uploaded: true };
  }

  const statusDetail = {
    formCode: registrationForm.registrationFormCode,
    overallStatus: registrationForm.status,
    currentStep: registrationForm.currentStep,
    
    progress: {
      step1_residence: {
        completed: registrationForm.completedSteps.includes(1),
        data: registrationForm.formData?.residence || null
      },
      step2_temporary: {
        completed: registrationForm.completedSteps.includes(2),
        data: registrationForm.formData?.temporary || null
      },
      step3_documents: {
        completed: registrationForm.completedSteps.includes(3),
        canSubmit: canSubmitForm(registrationForm.requiredDocuments),
        requiredDocuments: registrationForm.requiredDocuments,
        missingRequiredDocs: getMissingDocs(registrationForm.requiredDocuments),
        uploaded: documents.map(d => ({
          type: d.type,
          status: d.status,
          uploadedAt: d.createdAt
        }))
      },
      step4_submitted: {
        completed: registrationForm.completedSteps.includes(4),
        submittedAt: registrationForm.submittedAt,
        stampedFormStatus
      }
    },

    submissionHistory: {
      submittedAt: registrationForm.submittedAt,
      resubmitCount: registrationForm.resubmitCount,
      approvedAt: registrationForm.approvedAt,
      rejectedAt: registrationForm.rejectedAt,
      rejectionReason: registrationForm.rejectionReason
    },

    pendingActions: []
  };

  if (registrationForm.status === "draft") {
    if (!registrationForm.completedSteps.includes(1)) {
      statusDetail.pendingActions.push("Hoàn thành đơn đăng ký nội trú (Step 1)");
    }
    if (!registrationForm.completedSteps.includes(2)) {
      statusDetail.pendingActions.push("Hoàn thành đơn đăng ký tạm trú (Step 2)");
    }
    if (!canSubmitForm(registrationForm.requiredDocuments)) {
      statusDetail.pendingActions.push(`Upload tài liệu còn thiếu: ${getMissingDocs(registrationForm.requiredDocuments).join(", ")}`);
    }
    if (registrationForm.completedSteps.includes(1) && 
        registrationForm.completedSteps.includes(2) && 
        canSubmitForm(registrationForm.requiredDocuments)) {
      statusDetail.pendingActions.push("Nộp hồ sơ");
    }
  } else if (["submitted", "pending"].includes(registrationForm.status)) {
    if (!registrationForm.requiredDocuments.stampedForm && stampedFormStatus?.isOverdue) {
      statusDetail.pendingActions.push("QUÁ HẠN: Upload đơn có dấu xác nhận");
    } else if (!registrationForm.requiredDocuments.stampedForm) {
      statusDetail.pendingActions.push(`Upload đơn có dấu xác nhận (còn ${stampedFormStatus?.daysRemaining} ngày)`);
    }
    statusDetail.pendingActions.push("Chờ admin duyệt hồ sơ");
  } else if (registrationForm.status === "missing_document") {
    statusDetail.pendingActions.push(`Bổ sung tài liệu: ${missingDocuments.map(m => m.documentType).join(", ")}`);
  }

  successResponse(res, "Registration status retrieved", statusDetail);
});

// ============ ADMIN: REQUEST MISSING DOCUMENTS ============

export const requestMissingDocuments = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { missingDocumentTypes, deadline, note } = req.body;

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

// ============ ADMIN: APPROVE/REJECT ============

export const approveRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

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

export const rejectRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (!isValidStatusTransition(registrationForm.status, "rejected")) {
    return badRequestResponse(res, `Cannot reject form with status: ${registrationForm.status}`);
  }

  if (!rejectionReason) {
    return badRequestResponse(res, "Rejection reason is required");
  }

  const updatedForm = await RegistrationForm.findByIdAndUpdate(
    id,
    {
      status: "rejected",
      rejectedAt: new Date(),
      isLocked: true,
      rejectionReason,
      rejectedBy: req.user?._id
    },
    { new: true }
  ).populate("userId", "fullName email studentCode");

  successResponse(res, "Registration form rejected successfully", updatedForm);
});

// ============ LIST & SEARCH ============

export const getRegistrationForms = expressAsyncHandler(async (req, res) => {
  const { 
    status, 
    submissionType,
    isMissingDocuments,
    page = 1, 
    limit = 10,
    sortBy = "createdAt",
    order = "desc"
  } = req.query;

  // Nếu không phải admin, chỉ lấy form của user hiện tại
  const isAdmin = req.user?.role === 'admin';
  const filter = {};
  
  if (!isAdmin || req.query.userId) {
    filter.userId = req.query.userId || req.user._id;
  }

  if (status) filter.status = status;
  if (submissionType) filter.submissionType = submissionType;
  if (isMissingDocuments !== undefined) filter.isMissingDocuments = isMissingDocuments === "true";

  const sortOrder = order === "asc" ? 1 : -1;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [registrationForms, total] = await Promise.all([
    RegistrationForm.find(filter)
      .populate("userId", "fullName email studentCode phone")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    RegistrationForm.countDocuments(filter)
  ]);

  const pagination = {
    data: registrationForms,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };

  successResponse(res, "Registration forms retrieved successfully", pagination);
});

export const getRegistrationFormById = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const registrationForm = await RegistrationForm.findById(id)
    .populate("userId", "fullName email studentCode phone address");

  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  const [documents, missingDocuments] = await Promise.all([
    RegistrationDocument.find({ registrationForm: id }).sort({ createdAt: -1 }),
    RegistrationMissingDocument.find({ registrationForm: id }).sort({ createdAt: -1 })
  ]);

  successResponse(res, "Registration form retrieved successfully", {
    ...registrationForm.toObject(),
    documents,
    missingDocuments
  });
});

// ============ DELETE (ONLY DRAFT) ============

export const deleteRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (!["draft", "rejected"].includes(registrationForm.status)) {
    return badRequestResponse(res, "Can only delete forms with status: draft or rejected");
  }

  await Promise.all([
    RegistrationDocument.deleteMany({ registrationForm: id }),
    RegistrationMissingDocument.deleteMany({ registrationForm: id }),
    RegistrationForm.findByIdAndDelete(id)
  ]);

  successResponse(res, "Registration form deleted successfully");
});