import RegistrationForm from "../../models/registration/registrationForm.model.js";
import RegistrationDocument from "../../models/registration/registrationDocument.model.js";
import RegistrationMissingDocument from "../../models/registration/registrationMissingDocument.model.js";
import User from "../../models/user/user.model.js";
import { generateRegistrationCode } from "../../utils/generateCode.js";
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  forbiddenResponse,
  createdResponse,
} from "../../utils/response.js";
import { logSecurityEvent } from "../../utils/security.logger.js";
import expressAsyncHandler from "express-async-handler";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
  buildPaginationResponse,
  calculateOverallProgress
} from "../../utils/registration.utils.js";
import ejs from "ejs";
import {
  uploadSignatureBase64,
  getSignedSignatureUrl,
  uploadSensitiveDocument,
  getSignedDocumentUrl,
  SENSITIVE_DOC_TYPES
} from "../../services/cloudinaryUpload.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const { submissionType = "online", source = "user", userId: bodyUserId } = req.body;
  const currentUser = req.user;

  // Kiểm tra quyền tạo form
  const isAdmin = currentUser.role === 'admin';

  // Admin có thể tạo cho user khác (bodyUserId), ngược lại lấy từ currentUser
  const userId = isAdmin && bodyUserId ? bodyUserId : currentUser._id;

  // Chỉ admin được tạo offline form cho người khác
  const isCreatingForSelf = userId.toString() === currentUser._id.toString();
  if (submissionType === "offline" && !isAdmin && !isCreatingForSelf) {
    return badRequestResponse(res, "Only admin can create offline forms for other users");
  }

  // Kiểm tra user đã có form active nào chưa (chỉ cho phép 1 form)
  // Admin tạo cho người khác cũng phải tuân theo luật này
  const existingForm = await RegistrationForm.findOne({
    userId: userId,
    status: { $nin: ["rejected"] }
  });

  if (existingForm) {
    return badRequestResponse(res, "Bạn đã có một đơn đăng ký đang xử lý. Vui lòng hoàn thành hoặc xóa đơn hiện tại trước khi tạo đơn mới.", {
      existingFormId: existingForm._id,
      existingFormCode: existingForm.registrationFormCode,
      existingStatus: existingForm.status
    });
  }

  // Admin tạo trực tiếp (OFFLINE NO APP) → status = received_offline
  // User tạo qua app chọn OFFLINE → status = pending_offline
  // User tạo qua app ONLINE → status = draft
  let initialStatus;
  let currentStep = 1;
  let message;
  let instructions = null;

  if (submissionType === "offline") {
    if (source === "admin" && isAdmin) {
      // OFFLINE NO APP: Admin tạo hộ sau khi nhận giấy
      initialStatus = "received_offline";
      currentStep = 0;
      message = "Offline form created by admin. Please enter form data and upload scanned documents.";
    } else {
      // OFFLINE APP: User tạo qua app, sau đó in và nộp
      initialStatus = "pending_offline";
      currentStep = 0;
      message = "Offline registration form created. Please download forms, print, fill and submit at the office.";
      instructions = {
        steps: [
          "1. Download and print the forms",
          "2. Fill in the information manually",
          "3. Get required stamps/signatures",
          "4. Submit all documents at the dormitory office",
          "5. Bring: CCCD, Student Card, and completed forms"
        ],
        requiredDocuments: ["cccd_front", "cccd_back", "student_card", "stamped_form"]
      };
    }
  } else {
    // ONLINE
    initialStatus = "draft";
    currentStep = 1;
    message = "Registration form created successfully";
  }

  const registrationFormCode = generateRegistrationCode();

  const registrationForm = new RegistrationForm({
    registrationFormCode,
    userId: isAdmin ? userId : currentUser._id,
    submissionType,
    source: isAdmin ? "admin" : "user",
    formData: { residence: {}, temporary: {} },
    status: initialStatus,
    currentStep,
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
    canSubmitWithoutStamp: true,
    // Cho offline no app: admin đã nhận giấy rồi
    receivedAt: source === "admin" && isAdmin && submissionType === "offline" ? new Date() : undefined,
    receivedBy: source === "admin" && isAdmin && submissionType === "offline" ? currentUser._id : undefined
  });

  await registrationForm.save();

  createdResponse(res, message, {
    registrationForm,
    instructions,
    flow: submissionType === "offline" ? (source === "admin" ? "OFFLINE_NO_APP" : "OFFLINE_APP") : "ONLINE"
  });
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
  // fileUrl: URL public (cho stamped_form, priority_proof)
  // filePath + originalname: cho luồng sensitive (CCCD, thẻ SV) — upload qua multer trước
  const { type, fileUrl, filePath, originalname, note } = req.body;

  if (!type) {
    return badRequestResponse(res, "type is required");
  }

  // Giấy tờ nhạy cảm yêu cầu filePath (upload từ server qua authenticated)
  // Giấy tờ thường yêu cầu fileUrl (Frontend đã upload lên public Cloudinary)
  const isSensitive = SENSITIVE_DOC_TYPES.includes(type);
  if (isSensitive && !filePath) {
    return badRequestResponse(res, `${type} là giấy tờ nhạy cảm. Vui lòng gửi kèm filePath thay vì fileUrl.`);
  }
  if (!isSensitive && !fileUrl) {
    return badRequestResponse(res, "fileUrl is required");
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

  // ── Xử lý upload tuỳ loại giấy tờ ────────────────────────────────────────
  let finalFileUrl = fileUrl;
  let cloudinaryPublicId = null;

  if (isSensitive) {
    // Upload lên Cloudinary với type=authenticated, lấy publicId
    try {
      const uploadResult = await uploadSensitiveDocument(
        filePath,
        req.user._id.toString(),
        type,
        originalname || type
      );
      finalFileUrl = uploadResult.url;       // secure_url (chỉ dùng metadata)
      cloudinaryPublicId = uploadResult.publicId; // Dùng để sinh Signed URL sau này
    } catch (uploadErr) {
      return errorResponse(res, `Upload ${type} thất bại: ${uploadErr.message}`, 500);
    }
  }

  // ── Lưu / cập nhật document vào DB ───────────────────────────────────────
  const existingDoc = await RegistrationDocument.findOne({
    registrationForm: id,
    type
  });

  let document;
  if (existingDoc) {
    existingDoc.fileUrl = finalFileUrl;
    existingDoc.publicId = cloudinaryPublicId;  // null nếu không phải sensitive
    existingDoc.note = note;
    existingDoc.status = "pending";
    document = await existingDoc.save();
  } else {
    document = new RegistrationDocument({
      registrationForm: id,
      type,
      fileUrl: finalFileUrl,
      publicId: cloudinaryPublicId,
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

  // Sinh Signed URL nếu là giấy tờ nhạy cảm (30 phút)
  const signedUrl = cloudinaryPublicId ? getSignedDocumentUrl(cloudinaryPublicId) : null;

  successResponse(res, "Document uploaded successfully", {
    document: {
      ...document.toObject(),
      publicId: undefined,  // ẩn publicId khỏi response
      signedUrl             // URL tạm thời 30 phút để preview ngay sau upload
    },
    canSubmit,
    missingDocs,
    requiredDocuments: registrationForm.requiredDocuments,
    currentStep: registrationForm.currentStep
  });
});

// ============ STEP 3b: UPLOAD CCCD / THẺ SV (SENSITIVE — AUTHENTICATED) ============

export const uploadSensitiveDocumentHandler = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, note } = req.body;

  if (!req.file) {
    return badRequestResponse(res, "Chưa chọn file. Vui lòng gửi file qua field 'image'.");
  }

  if (!type || !SENSITIVE_DOC_TYPES.includes(type)) {
    return badRequestResponse(res, `type phải là một trong: ${SENSITIVE_DOC_TYPES.join(", ")}`);
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return badRequestResponse(res, "Invalid registration form ID");
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  if (!["draft", "submitted", "missing_document"].includes(registrationForm.status)) {
    return badRequestResponse(res, "Cannot upload documents at this stage");
  }

  // Upload lên Cloudinary type=authenticated
  let uploadResult;
  try {
    uploadResult = await uploadSensitiveDocument(
      req.file.path,
      req.user._id.toString(),
      type,
      req.file.originalname
    );
  } catch (uploadErr) {
    return errorResponse(res, `Upload ${type} thất bại: ${uploadErr.message}`, 500);
  }

  // Lưu / cập nhật vào DB
  const existingDoc = await RegistrationDocument.findOne({ registrationForm: id, type });

  let document;
  if (existingDoc) {
    existingDoc.fileUrl = uploadResult.url;
    existingDoc.publicId = uploadResult.publicId;
    existingDoc.note = note;
    existingDoc.status = "pending";
    document = await existingDoc.save();
  } else {
    document = await new RegistrationDocument({
      registrationForm: id,
      type,
      fileUrl: uploadResult.url,
      publicId: uploadResult.publicId,
      note,
      uploadedBy: "student",
      status: "pending"
    }).save();
  }

  // Đánh dấu requiredDocuments
  if (DOCUMENT_TYPE_MAPPING[type]) {
    registrationForm.requiredDocuments[DOCUMENT_TYPE_MAPPING[type]] = true;
    await registrationForm.save();
  }

  const canSubmit = canSubmitForm(registrationForm.requiredDocuments);
  const missingDocs = getMissingDocs(registrationForm.requiredDocuments);

  if (canSubmit && registrationForm.currentStep === 3) {
    registrationForm.currentStep = 4;
    if (!registrationForm.completedSteps.includes(3)) registrationForm.completedSteps.push(3);
    await registrationForm.save();
  }

  // Trả về Signed URL 30 phút để preview ngay
  const signedUrl = getSignedDocumentUrl(uploadResult.publicId);

  successResponse(res, `Upload ${type} thành công`, {
    document: {
      ...document.toObject(),
      publicId: undefined,   // ẩn publicId khỏi response
      signedUrl              // Signed URL 30 phút
    },
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

  // ── Upload chữ ký Base64 lên Cloudinary (type=authenticated) trước khi mở transaction ──
  let signaturePublicId = null;
  if (signature) {
    // Chấp nhận cả dạng base64 thuần và dạng Data URL (data:image/png;base64,...)
    const isBase64 = signature.startsWith("data:") || /^[A-Za-z0-9+/=]+$/.test(signature.substring(0, 20));
    if (!isBase64) {
      return badRequestResponse(res, "Chữ ký không hợp lệ. Vui lòng ký lại.");
    }
    try {
      const uploadResult = await uploadSignatureBase64(signature, req.user._id.toString());
      signaturePublicId = uploadResult.publicId;
    } catch (uploadError) {
      return errorResponse(res, `Không thể lưu chữ ký: ${uploadError.message}`, 500);
    }
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
        // Lưu publicId thay vì raw Base64 — giữ DB nhẹ
        signature: signaturePublicId,
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

    // Tạo Signed URL 1h để trả về cho frontend preview ngay sau khi submit
    const signatureUrl = getSignedSignatureUrl(signaturePublicId);

    successResponse(res, "Registration form submitted successfully", {
      registrationForm: {
        ...lockedForm.toObject(),
        signatureUrl   // URL hiển thị tạm thời (1h)
      },
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
          uploadedAt: d.createdAt,
          // Sinh Signed URL 30 phút cho tài liệu nhạy cảm, null nếu không có publicId
          signedUrl: d.publicId ? getSignedDocumentUrl(d.publicId) : d.fileUrl
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

  successResponse(res, "Registration status retrieved", {
    ...statusDetail,
    // Signed URL có thời hạn 1 giờ — Frontend dùng để hiển thị preview chữ ký
    signatureUrl: getSignedSignatureUrl(registrationForm.signature)
  });
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

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return badRequestResponse(res, `Invalid registration form ID format: ${id}. Please check the URL.`);
  }

  const registrationForm = await RegistrationForm.findById(id)
    .populate("userId", "fullName email studentCode phone address");

  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  const [documents, missingDocuments] = await Promise.all([
    RegistrationDocument.find({ registrationForm: id }).sort({ createdAt: -1 }),
    RegistrationMissingDocument.find({ registrationForm: id }).sort({ createdAt: -1 })
  ]);

  const signatureUrl = getSignedSignatureUrl(registrationForm.signature);

  // Enrich mỗi document: ẩn publicId, thêm signedUrl 30 phút nếu là tài liệu nhạy cảm
  const enrichedDocuments = documents.map(d => ({
    ...d.toObject(),
    publicId: undefined,
    signedUrl: d.publicId ? getSignedDocumentUrl(d.publicId) : d.fileUrl
  }));

  successResponse(res, "Registration form retrieved successfully", {
    ...registrationForm.toObject(),
    signature: undefined,
    signatureUrl,
    documents: enrichedDocuments,
    missingDocuments
  });
});

// ============ HELPER FUNCTIONS FOR getRegistrationFormCurrent ============

const ADMIN_STAGE_MAP = {
  submitted: { code: "submitted", label: "Đã nộp", badge: "Chờ duyệt", percent: 100 },
  pending: { code: "pending", label: "Chờ xử lý", badge: "Đang chờ duyệt", percent: 100 },
  resubmitted: { code: "resubmitted", label: "Đã bổ sung", badge: "Chờ duyệt lại", percent: 100 },
  missing_document: { code: "missing_document", label: "Thiếu tài liệu", badge: "Cần bổ sung", percent: 90 },
  processing: { code: "processing", label: "Đang xử lý", badge: "Đang xử lý", percent: 100 },
  pending_offline: { code: "pending_offline", label: "Chờ nộp offline", badge: "Chờ nộp tại văn phòng", percent: 100 },
  received_offline: { code: "received_offline", label: "Đã tiếp nhận", badge: "Đã tiếp nhận", percent: 100 },
  approved: { code: "approved", label: "Đã duyệt", badge: "Hoàn thành", percent: 100 },
  rejected: { code: "rejected", label: "Từ chối", badge: "Không đạt", percent: 100 }
};

const getStampedFormStatus = (form) => {
  if (form.requiredDocuments.stampedForm) {
    return { uploaded: true };
  }
  if (!form.stampedFormDeadline) return null;
  
  const daysRemaining = Math.ceil(
    (form.stampedFormDeadline - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return {
    uploaded: false,
    deadline: form.stampedFormDeadline,
    daysRemaining: Math.max(daysRemaining, 0),
    isOverdue: daysRemaining < 0
  };
};

const getPendingActions = (status, requiredDocs, stampedStatus, missingDocs) => {
  const actions = [];
  
  switch (status) {
    case "missing_document":
      actions.push(`Bổ sung: ${missingDocs.map(m => m.documentType).join(", ")}`);
      break;
    case "submitted":
    case "pending":
    case "resubmitted":
      if (!requiredDocs.stampedForm) {
        actions.push(stampedStatus?.isOverdue 
          ? "QUÁ HẠN: Upload đơn có dấu" 
          : `Upload đơn có dấu (còn ${stampedStatus?.daysRemaining} ngày)`
        );
      }
      actions.push("Chờ admin duyệt");
      break;
    case "processing":
      actions.push("Hồ sơ đang xử lý");
      break;
    case "pending_offline":
      actions.push("In và nộp đơn tại văn phòng KTX");
      break;
    case "received_offline":
      actions.push("Đã tiếp nhận, chờ nhập liệu");
      break;
  }
  
  return actions;
};

// ============ GET CURRENT REGISTRATION (DRAFT OR ACTIVE) ============

export const getRegistrationFormCurrent = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  // 1. Ưu tiên tìm draft form
  const draft = await RegistrationForm.findOne({ userId, status: "draft" })
    .sort({ createdAt: -1 })
    .populate("userId", "fullName email studentCode phone address")
    .lean();

  if (draft) {
    const [docs, missingDocs] = await Promise.all([
      RegistrationDocument.find({ registrationForm: draft._id }).sort({ createdAt: -1 }).lean(),
      RegistrationMissingDocument.find({ registrationForm: draft._id }).sort({ createdAt: -1 }).lean()
    ]);

    const progress = Math.round((draft.completedSteps.length / 4) * 100);

    return successResponse(res, "Draft form found", {
      hasRegistration: true,
      type: "draft",
      progressPercent: progress,
      draft: { ...draft, documents: docs, missingDocuments: missingDocs },
      active: null
    });
  }

  // 2. Tìm active form (bao gồm cả đơn đã duyệt và từ chối)
  const activeStatuses = [
    "submitted", "pending", "missing_document", "resubmitted",
    "pending_offline", "received_offline", "processing",
    "approved", "rejected"
  ];

  const active = await RegistrationForm.findOne({ userId, status: { $in: activeStatuses } })
    .sort({ submittedAt: -1, createdAt: -1 })
    .populate("userId", "fullName email studentCode phone address")
    .lean();

  if (!active) {
    return successResponse(res, "No registration found", {
      hasRegistration: false, type: null, progressPercent: 0, draft: null, active: null
    });
  }

  // 3. Lấy dữ liệu liên quan song song
  const [documents, missingDocuments, progressDetail] = await Promise.all([
    RegistrationDocument.find({ registrationForm: active._id }).sort({ createdAt: -1 }).lean(),
    RegistrationMissingDocument.find({ registrationForm: active._id, isResolved: false }).sort({ createdAt: -1 }).lean(),
    Promise.resolve(calculateOverallProgress(active))
  ]);

  const stampedStatus = getStampedFormStatus(active);
  const pendingActions = getPendingActions(active.status, active.requiredDocuments, stampedStatus, missingDocuments);
  const adminStage = ADMIN_STAGE_MAP[active.status] || null;
  const signatureUrl = active.signature ? getSignedSignatureUrl(active.signature) : null;

  console.log(`[getRegistrationFormCurrent] ${active.status} → ${progressDetail.total}% (${progressDetail.currentStage})`);

  // Xác định type để frontend điều hướng
  const formType = active.status === "approved" ? "approved" :
                   active.status === "rejected" ? "rejected" : "active";

  return successResponse(res, "Active submission found", {
    hasRegistration: true,
    type: formType,
    progressPercent: progressDetail.total,
    draft: null,
    active: {
      ...active,
      signature: undefined,
      documents: documents.map(d => ({ ...d, publicId: undefined, signedUrl: d.publicId ? getSignedDocumentUrl(d.publicId) : d.fileUrl })),
      missingDocuments,
      signatureUrl
    },
    tracking: {
      formCode: active.registrationFormCode,
      status: {
        code: active.status,
        display: getStatusDisplay(active.status),
        badge: adminStage?.badge || "Đang xử lý"
      },
      timeline: {
        submittedAt: active.submittedAt,
        lastUpdated: active.updatedAt
      },
      progress: {
        percent: progressDetail.total,
        currentStage: progressDetail.currentStage,
        userCompleted: progressDetail.statusBreakdown.user.completed,
        totalSteps: 4,
        nextAction: pendingActions[0] || "Hoàn tất"
      },
      stages: progressDetail.stages,
      stampedForm: stampedStatus,
      pendingActions,
      flags: {
        canUploadStamped: ["submitted", "pending", "missing_document"].includes(active.status) &&
          !active.requiredDocuments.stampedForm && !stampedStatus?.isOverdue,
        isLocked: active.isLocked,
        hasMissingDocs: active.status === "missing_document"
      }
    }
  });
});

export const getActiveRegistrationForm = expressAsyncHandler(async (req, res) => {
  const userId = req.user._id;

  const activeStatuses = [
    "submitted", "pending", "missing_document", "resubmitted",
    "pending_offline", "received_offline", "processing"
  ];

  const form = await RegistrationForm.findOne({ userId, status: { $in: activeStatuses } })
    .sort({ submittedAt: -1, createdAt: -1 })
    .populate("userId", "fullName email studentCode phone address")
    .lean();

  if (!form) {
    return successResponse(res, "No active submission found", {
      hasActiveForm: false, registrationForm: null
    });
  }

  const [documents, missingDocuments, progressDetail] = await Promise.all([
    RegistrationDocument.find({ registrationForm: form._id }).sort({ createdAt: -1 }).lean(),
    RegistrationMissingDocument.find({ registrationForm: form._id, isResolved: false }).sort({ createdAt: -1 }).lean(),
    Promise.resolve(calculateOverallProgress(form))
  ]);

  const stampedStatus = getStampedFormStatus(form);
  const pendingActions = getPendingActions(form.status, form.requiredDocuments, stampedStatus, missingDocuments);
  const adminStage = ADMIN_STAGE_MAP[form.status] || null;

  successResponse(res, "Active submission retrieved successfully", {
    hasActiveForm: true,
    registrationForm: {
      ...form,
      documents: documents.map(d => ({ ...d, publicId: undefined, signedUrl: d.publicId ? getSignedDocumentUrl(d.publicId) : d.fileUrl })),
      missingDocuments
    },
    tracking: {
      formCode: form.registrationFormCode,
      status: {
        code: form.status,
        display: getStatusDisplay(form.status),
        badge: adminStage?.badge || "Đang xử lý"
      },
      timeline: {
        submittedAt: form.submittedAt,
        lastUpdated: form.updatedAt
      },
      progress: {
        percent: progressDetail.total,
        currentStage: progressDetail.currentStage,
        userCompleted: progressDetail.statusBreakdown.user.completed,
        totalSteps: 4,
        nextAction: pendingActions[0] || "Hoàn tất"
      },
      stages: progressDetail.stages,
      stampedForm: stampedStatus,
      pendingActions,
      flags: {
        canUploadStamped: ["submitted", "pending", "missing_document"].includes(form.status) &&
          !form.requiredDocuments.stampedForm && !stampedStatus?.isOverdue,
        isLocked: form.isLocked,
        hasMissingDocs: form.status === "missing_document"
      }
    }
  });
});

// Helper function để hiển thị status
function getStatusDisplay(status) {
  const statusMap = {
    submitted: "Đã nộp",
    pending: "Đang chờ xử lý",
    missing_document: "Thiếu tài liệu",
    resubmitted: "Đã bổ sung tài liệu",
    pending_offline: "Chờ nộp giấy",
    received_offline: "Đã nhận giấy",
    processing: "Đang xử lý",
    approved: "Đã duyệt",
    rejected: "Bị từ chối"
  };
  return statusMap[status] || status;
}

// ============ ADMIN: SAVE STEP 1 & 2 FOR OFFLINE FORM ============
// Cho phép admin nhập dữ liệu từ đơn giấy vào hệ thống

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

  // Chỉ cho phép khi status là received_offline
  if (registrationForm.status !== "received_offline") {
    return badRequestResponse(res, `Can only edit forms with status 'received_offline'. Current status: ${registrationForm.status}`);
  }

  // Validate Step 1 data
  const step1Errors = validateStep1(residenceData);
  if (step1Errors.length > 0) {
    return badRequestResponse(res, "Step 1 validation failed", { errors: step1Errors, step: 1 });
  }

  // Validate Step 2 data
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

  // Mark steps as completed
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

// ============ ADMIN: UPLOAD DOCUMENT FOR OFFLINE FORM ============
// Cho phép admin upload file scan từ đơn giấy

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

  // Chỉ cho phép khi status là received_offline
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
    existingDoc.status = "verified"; // Admin upload = auto verified
    document = await existingDoc.save();
  } else {
    document = new RegistrationDocument({
      registrationForm: id,
      type,
      fileUrl,
      note,
      uploadedBy: "admin",
      status: "verified" // Admin upload = auto verified
    });
    await document.save();
  }

  if (DOCUMENT_TYPE_MAPPING[type]) {
    registrationForm.requiredDocuments[DOCUMENT_TYPE_MAPPING[type]] = true;
    await registrationForm.save();
  }

  const canProceed = canSubmitForm(registrationForm.requiredDocuments) && 
                     registrationForm.requiredDocuments.stampedForm;

  if (canProceed && !registrationForm.completedSteps.includes(3)) {
    registrationForm.completedSteps.push(3);
    await registrationForm.save();
  }

  successResponse(res, "Document uploaded successfully by admin", {
    document,
    canProceedToProcessing: canProceed,
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

  // Chỉ cho phép từ received_offline -> processing
  if (registrationForm.status !== "received_offline") {
    return badRequestResponse(res, `Can only move forms with status 'received_offline' to processing. Current status: ${registrationForm.status}`);
  }

  // Kiểm tra đã đủ dữ liệu và tài liệu chưa
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

// ============ OFFLINE SUBMISSION: MARK AS RECEIVED ============
// Luồng mới: User tạo form → In đơn → Nộp giấy → Admin tiếp nhận

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

  // Chỉ cho phép từ pending_offline -> received_offline
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
      isLocked: false // Cho phép admin nhập dữ liệu sau
    },
    { new: true }
  ).populate("userId", "fullName email studentCode phone address");

  successResponse(res, "Offline form marked as received", {
    registrationForm: updatedForm,
    nextStep: "Admin should now enter form data (Step 1 & 2) and upload scanned documents",
    note: "Paper documents received in person. Admin needs to input data into system."
  });
});

// ============ DELETE (ONLY DRAFT / REJECTED) ============

export const deleteRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;

  // 1. Tìm form
  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  // 2. Kiểm tra quyền sở hữu — student chỉ được xóa form của chính mình
  const isAdmin = currentUser.role === 'admin';
  const isOwner = registrationForm.userId &&
    registrationForm.userId.toString() === currentUser._id.toString();

  if (!isAdmin && !isOwner) {
    await logSecurityEvent("UNAUTHORIZED_DELETE_ATTEMPT", {
      userId: currentUser._id,
      targetFormId: id,
      targetFormCode: registrationForm.registrationFormCode,
      ip: req.ip,
      userAgent: req.get("User-Agent")
    });
    return forbiddenResponse(res, "Bạn không có quyền xóa đơn đăng ký này");
  }

  // 3. Chỉ được xóa khi trạng thái là draft hoặc rejected
  if (!["draft", "rejected"].includes(registrationForm.status)) {
    return badRequestResponse(
      res,
      `Chỉ được xóa đơn ở trạng thái 'draft' hoặc 'rejected'. Trạng thái hiện tại: ${registrationForm.status}`
    );
  }

  // 4. Dùng transaction để đảm bảo tính toàn vẹn dữ liệu
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await RegistrationDocument.deleteMany({ registrationForm: id }, { session });
    await RegistrationMissingDocument.deleteMany({ registrationForm: id }, { session });
    await RegistrationForm.findByIdAndDelete(id, { session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  // 5. Ghi audit log
  await logSecurityEvent("REGISTRATION_FORM_DELETED", {
    deletedBy: currentUser._id,
    deletedByRole: currentUser.role,
    formId: id,
    formCode: registrationForm.registrationFormCode,
    formStatus: registrationForm.status,
    formOwnerId: registrationForm.userId,
    ip: req.ip,
    userAgent: req.get("User-Agent")
  });

  // 6. Trả về metadata
  successResponse(res, "Xóa đơn đăng ký thành công", {
    deletedFormId: id,
    deletedFormCode: registrationForm.registrationFormCode,
    deletedStatus: registrationForm.status,
    deletedAt: new Date()
  });
});

// ============ CLAIM FORM (User liên kết form đã nộp offline) ============

export const claimRegistrationForm = expressAsyncHandler(async (req, res) => {
  const { formCode, cccd, email } = req.body;
  const currentUser = req.user;

  // Validate input
  if (!formCode) {
    return badRequestResponse(res, "Form code is required");
  }
  if (!cccd && !email) {
    return badRequestResponse(res, "CCCD or email is required for verification");
  }

  // Tìm form theo code và status phù hợp
  const registrationForm = await RegistrationForm.findOne({
    registrationFormCode: formCode,
    status: { $in: ["received_offline", "pending", "approved", "rejected"] }
  });

  if (!registrationForm) {
    return errorResponse(res, "Form not found or not eligible for claiming", 404);
  }

  // Kiểm tra nếu form đã có userId khác
  if (registrationForm.userId && registrationForm.userId.toString() !== currentUser._id.toString()) {
    // Nếu form đã gán cho user khác, không cho claim
    return badRequestResponse(res, "This form is already linked to another user account");
  }

  if (registrationForm.userId && registrationForm.userId.toString() === currentUser._id.toString()) {
    // Đã liên kết rồi
    return successResponse(res, "Form is already linked to your account", registrationForm);
  }

  // Verify identity bằng CCCD hoặc email trong formData
  const residenceData = registrationForm.formData?.residence || {};
  const formCccd = residenceData.cccd;
  const formEmail = residenceData.email;

  let isMatch = false;
  let matchedBy = "";

  if (cccd && formCccd && cccd.trim() === formCccd.trim()) {
    isMatch = true;
    matchedBy = "CCCD";
  } else if (email && formEmail && email.toLowerCase().trim() === formEmail.toLowerCase().trim()) {
    isMatch = true;
    matchedBy = "email";
  }

  if (!isMatch) {
    return badRequestResponse(res, "Information does not match. Please check your CCCD or email and try again.", {
      hint: "Make sure to use the same CCCD or email that was used when submitting the form at the office"
    });
  }

  // Gán userId cho form
  registrationForm.userId = currentUser._id;
  await registrationForm.save();

  // Populate để trả về đầy đủ thông tin
  const updatedForm = await RegistrationForm.findById(registrationForm._id)
    .populate("userId", "fullName email studentCode phone address");

  successResponse(res, "Form linked successfully! You can now track your application in the app.", {
    registrationForm: updatedForm,
    matchedBy,
    message: "Your offline submission has been linked to your account"
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

  // Kiểm tra user tồn tại
  const user = await User.findById(userId);
  if (!user) {
    return errorResponse(res, "User not found", 404);
  }

  // Nếu form đã có userId, thông báo
  const previousUserId = registrationForm.userId;

  // Cập nhật userId
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



// Preview đơn đăng ký nội trú dạng HTML
export const previewResidenceFormHTML = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const registrationForm = await RegistrationForm.findById(id)
    .populate("userId", "fullName email studentCode phone address");

  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  const residenceData = registrationForm.formData?.residence || {};
  
  // Đọc template HTML
  const templatePath = path.join(__dirname, "../templates/documents/don_dang_ky_KTX.html");
  let template = fs.readFileSync(templatePath, "utf-8");

  // format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN");
  };

  // format gender
  const formatGender = (gender) => {
    if (!gender) return "";
    return gender === "male" ? "Nam" : "Nữ";
  };

  // Cấu hình dữ liệu cho EJS
  const templateData = {
    hoTen: residenceData.fullName || "",
    gioiTinh: formatGender(residenceData.gender) || "",
    ngaySinh: formatDate(residenceData.dateOfBirth) || "",
    cccd: residenceData.cccd || "",
    ngayCapCccd: residenceData.cccdIdIssueDate || "",
    noiCapCccd: residenceData.cccdIdIssuePlace || "",
    hoKhauThuongTru: residenceData.permanentAddress || "",
    soDienThoai: residenceData.phoneNumber || "",
    email: residenceData.email || "",
    lienHeBaoTin: residenceData.emergencyContact || "",
    coSoDaoTao: residenceData.schoolName || "",
    nienKhoa: residenceData.academicYear || "",
    lop: residenceData.className || "",
    khoa: residenceData.department || "",
    theSinhVien: residenceData.studentId || "",
    doiTuongUuTien: residenceData.priorityType || "", // Có thể trống nếu không có ưu tiên
    khuKtx: residenceData.dormName || "",
    thoiGianThue: residenceData.duration || ""
  };

  try {
    // Render file theo chuẩn EJS Engine
    const renderedHtml = ejs.render(template, templateData);
    
    // Set content type và trả về HTML Output
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderedHtml);
  } catch (error) {
    return errorResponse(res, `EJS Render Error: ${error.message}`, 500);
  }
});


// Preview đơn đăng ký tạm trú dạng HTML
export const previewTemporaryFormHTML = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const registrationForm = await RegistrationForm.findById(id)
    .populate("userId", "fullName email studentCode phone address");

  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  const temporaryData = registrationForm.formData?.temporary || {};
  
  // Đọc template HTML
  const templatePath = path.join(__dirname, "../templates/documents/don_tam_tru_KTX.html");
  let template = fs.readFileSync(templatePath, "utf-8");

  // format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN");
  };

  // format gender
  const formatGender = (gender) => {
    if (!gender) return "";
    return gender === "male" ? "Nam" : "Nữ";
  };

  // Cấu hình dữ liệu cho EJS
  const templateData = {
    noiNhan: temporaryData.receiver || "",
    hoTen: temporaryData.fullName || "",
    ngaySinh: formatDate(temporaryData.dateOfBirth) || "",
    gioiTinh: formatGender(temporaryData.gender) || "",
    soDienThoai: temporaryData.phoneNumber || "",
    email: temporaryData.email || "",
    chuHo: temporaryData.ownerName || "",
    moiQuanHe: temporaryData.ownerRelation || "",
    noiDungDeNghi: temporaryData.requestContent || "",
    cccd: temporaryData.cccd || "",
    ownerCccd: temporaryData.ownerCccd || ""
  };

  try {
    // Render file theo chuẩn EJS Engine
    const renderedHtml = ejs.render(template, templateData);
    
    // Set content type và trả về HTML Output
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderedHtml);
  } catch (error) {
    return errorResponse(res, `EJS Render Error: ${error.message}`, 500);
  }
});

// ============ ADMIN: CONFIRM SINGLE FORM (Step 1) ============
// Admin xác nhận 1 đơn cụ thể để chuyển sang kiểm tra

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

  // Chỉ cho phép confirm khi status là "submitted"
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

// ============ ADMIN: BATCH CONFIRM FORMS (Step 1) ============
// Admin xác nhận hàng loạt đơn đã nộp để chuyển sang kiểm tra

export const adminConfirmForms = expressAsyncHandler(async (req, res) => {
  const { formIds, confirmAll = false } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  let formsToProcess = [];

  if (confirmAll) {
    // Lấy tất cả form đang ở status "submitted"
    formsToProcess = await RegistrationForm.find({
      status: "submitted"
    }).select("_id status registrationFormCode");
  } else if (formIds && formIds.length > 0) {
    // Lấy các form được chỉ định (phải ở status "submitted")
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

// ============ ADMIN: CHECK OVERDUE AND AUTO-REJECT ============
// Kiểm tra và tự động từ chối các đơn quá hạn nộp stamped form

export const adminCheckOverdueForms = expressAsyncHandler(async (req, res) => {
  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  const now = new Date();

  // Tìm các form đang ở "pending" và đã quá hạn nộp stamped form
  const overdueForms = await RegistrationForm.find({
    status: "pending",
    stampedFormDeadline: { $lt: now },
    "requiredDocuments.stampedForm": false
  });

  if (overdueForms.length === 0) {
    return successResponse(res, "Không có đơn nào quá hạn", {
      checkedCount: 0,
      autoRejectedCount: 0,
      autoRejectedForms: []
    });
  }

  const autoRejectedForms = [];

  for (const form of overdueForms) {
    try {
      await RegistrationForm.findByIdAndUpdate(
        form._id,
        {
          status: "rejected",
          rejectedAt: new Date(),
          rejectedBy: req.user._id,
          rejectionReason: "Quá hạn nộp đơn có dấu xác nhận (7 ngày)",
          isLocked: true
        }
      );

      autoRejectedForms.push({
        formId: form._id,
        formCode: form.registrationFormCode,
        deadline: form.stampedFormDeadline,
        daysOverdue: Math.ceil((now - form.stampedFormDeadline) / (1000 * 60 * 60 * 24))
      });
    } catch (error) {
      console.error(`[AutoReject] Failed to reject form ${form._id}:`, error);
    }
  }

  successResponse(res, `Đã tự động từ chối ${autoRejectedForms.length} đơn quá hạn`, {
    checkedCount: overdueForms.length,
    autoRejectedCount: autoRejectedForms.length,
    autoRejectedForms
  });
});

// ============ ADMIN: REVIEW DOCUMENTS (Step 2) ============
// Admin kiểm tra tài liệu và quyết định: đủ → approve, thiếu → missing_document/reject

export const adminReviewDocuments = expressAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const { decision, missingDocuments = [], rejectionReason = "" } = req.body;

  // Chỉ admin được dùng
  if (req.user.role !== 'admin') {
    return errorResponse(res, "Unauthorized - Admin only", 403);
  }

  // Validate decision
  if (!["approve", "missing_document", "reject"].includes(decision)) {
    return badRequestResponse(res, "Decision phải là: approve | missing_document | reject");
  }

  const registrationForm = await RegistrationForm.findById(id);
  if (!registrationForm) {
    return errorResponse(res, "Registration form not found", 404);
  }

  // Chỉ cho phép review khi status là "pending"
  if (registrationForm.status !== "pending") {
    return badRequestResponse(res, `Chỉ được review form ở trạng thái 'pending'. Hiện tại: ${registrationForm.status}`);
  }

  // Kiểm tra có phải quá hạn không
  const now = new Date();
  const isOverdue = registrationForm.stampedFormDeadline && 
                     now > registrationForm.stampedFormDeadline &&
                     !registrationForm.requiredDocuments.stampedForm;

  // Nếu quá hạn → auto reject
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

  // Xử lý theo decision
  if (decision === "approve") {
    // Kiểm tra đủ tài liệu chưa
    const docs = registrationForm.requiredDocuments;
    const requiredDocs = ["cccdFront", "cccdBack", "studentCard", "stampedForm"];
    const missingRequiredDocs = requiredDocs.filter(doc => !docs[doc]);

    if (missingRequiredDocs.length > 0) {
      return badRequestResponse(res, "Không thể duyệt: Thiếu tài liệu", {
        missingDocuments: missingRequiredDocs,
        suggestion: "Sử dụng decision = 'missing_document' để yêu cầu bổ sung"
      });
    }

    // Approve
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
    // Yêu cầu bổ sung tài liệu
    if (missingDocuments.length === 0) {
      return badRequestResponse(res, "Vui lòng chỉ định tài liệu còn thiếu");
    }

    const updatedForm = await RegistrationForm.findByIdAndUpdate(
      id,
      {
        status: "missing_document",
        missingDocumentNote: `Thiếu tài liệu: ${missingDocuments.join(", ")}`,
        resubmitDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 ngày để bổ sung
        isLocked: false
      },
      { new: true }
    );

    // Tạo bản ghi missing documents
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
    // Từ chối đơn
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
  const { period = "30d" } = req.query; // 7d, 30d, 90d, 1y

  // Tính ngày bắt đầu theo period
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

  // ========== 1. TỔNG QUAN STATUS ==========
  const statusStats = await RegistrationForm.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const statusMap = {
    draft: 0, submitted: 0, pending: 0, processing: 0,
    missing_document: 0, resubmitted: 0, approved: 0,
    rejected: 0, pending_offline: 0, received_offline: 0
  };
  statusStats.forEach(s => statusMap[s._id] = s.count);

  // ========== 2. THỐNG KÊ THEO THỜI GIAN ==========
  const dailyStats = await RegistrationForm.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        submitted: { $sum: { $cond: [{ $gte: ["$currentStep", 4] }, 1, 0] } },
        drafts: { $sum: { $cond: [{ $lt: ["$currentStep", 4] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // ========== 3. THỐNG KÊ XỬ LÝ CỦA ADMIN ==========
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

  // ========== 4. ĐƠN CẦN CHÚ Ý ==========
  const attentionNeeded = await RegistrationForm.countDocuments({
    $or: [
      { status: "missing_document", resubmitDeadline: { $lt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) } },
      { status: "submitted", createdAt: { $lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
      { status: "pending", createdAt: { $lt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } }
    ]
  });

  // ========== 5. THỐNG KÊ THEO LOẠI PHÒNG/QUẬN (từ formData) ==========
  const districtStats = await RegistrationForm.aggregate([
    { $match: { "formData.residence.district": { $exists: true } } },
    {
      $group: {
        _id: "$formData.residence.district",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // ========== 6. TỶ LỆ HOÀN THÀNH ==========
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
