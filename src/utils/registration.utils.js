// ============ CONSTANTS ============
export const ALLOWED_STATUS_TRANSITIONS = {
  draft: ["submitted"],
  draft_offline: ["pending"],
  submitted: ["missing_document", "pending", "approved", "rejected"],
  missing_document: ["resubmitted"],
  resubmitted: ["pending", "approved", "rejected"],
  pending: ["approved", "rejected", "missing_document"],
  approved: [],
  rejected: [],
  pending_offline: ["received_offline"],
  received_offline: ["processing", "rejected"],
  processing: ["approved", "rejected", "missing_document"]
};

export const VALID_DOCUMENT_TYPES = [
  "cccd_front",
  "cccd_back",
  "student_card",
  "priority_proof",
  "stamped_form",
  "other"
];

export const DOCUMENT_TYPE_MAPPING = {
  'cccd_front': 'cccdFront',
  'cccd_back': 'cccdBack',
  'student_card': 'studentCard',
  'priority_proof': 'priorityDoc',
  'stamped_form': 'stampedForm'
};

// ============ VALIDATION FUNCTIONS ============
export const validateStep1 = (data) => {
  const errors = [];
  if (!data?.fullName?.trim()) errors.push("Họ và tên bắt buộc");
  if (!data?.gender?.trim()) errors.push("Giới tính bắt buộc");
  if (!data?.dateOfBirth) errors.push("Ngày sinh bắt buộc");
  if (!data?.cccd?.trim()) errors.push("Căn cước công dân bắt buộc");
  if (!data?.cccdIdIssueDate?.trim()) errors.push("Ngày cấp căn cước công dân bắt buộc");
  if (!data?.cccdIdIssuePlace?.trim()) errors.push("Nơi cấp căn cước công dân bắt buộc");
  if (!data?.permanentAddress?.trim()) errors.push("Địa chỉ thường trú bắt buộc");
  if (!data?.phoneNumber?.trim()) errors.push("Số điện thoại bắt buộc");
  if (!data?.email?.trim()) errors.push("Email bắt buộc");
  if (!data?.emergencyContact?.trim()) errors.push("Liên hệ khẩn cấp bắt buộc");
  if (!data?.schoolName?.trim()) errors.push("Cơ sở đào tạo bắt buộc");
  if (!data?.major?.trim()) errors.push("Chuyên ngành bắt buộc");
  if (!data?.academicYear?.trim()) errors.push("Niên khóa bắt buộc");
  if (!data?.className?.trim()) errors.push("Lớp bắt buộc");
  if (!data?.department?.trim()) errors.push("Khoa bắt buộc");
  if (!data?.studentId?.trim()) errors.push("Mã sinh viên bắt buộc");
  if (!data?.dormName?.trim()) errors.push("Khu ký túc xá bắt buộc");
  if (!data?.duration) errors.push("Thời gian thuê bắt buộc");
  return errors;
};

export const validateStep2 = (data) => {
  const errors = [];
   if (!data?.receiver?.trim()) errors.push("Nơi nhận bắt buộc");
   if (!data?.fullName?.trim()) errors.push("Họ và tên bắt buộc");
  if (!data?.gender?.trim()) errors.push("Giới tính bắt buộc");
  if (!data?.dateOfBirth) errors.push("Ngày sinh bắt buộc");
  if (!data?.cccd?.trim()) errors.push("Căn cước công dân bắt buộc");
  if (!data?.phoneNumber?.trim()) errors.push("Số điện thoại bắt buộc");
  if (!data?.email?.trim()) errors.push("Email bắt buộc");
  if (!data?.requestContent?.trim()) errors.push("Nội dung yêu cầu bắt buộc");
  return errors;
};

export const validateAllSteps = (formData) => {
  const errors = [];
  const step1Errors = validateStep1(formData?.residence);
  const step2Errors = validateStep2(formData?.temporary);
  
  if (step1Errors.length > 0) {
    errors.push({ step: 1, errors: step1Errors });
  }
  if (step2Errors.length > 0) {
    errors.push({ step: 2, errors: step2Errors });
  }
  return errors;
};

// ============ HELPER FUNCTIONS ============
export const getMissingDocs = (requiredDocs) => {
  const missing = [];
  if (!requiredDocs.cccdFront) missing.push("cccd_front");
  if (!requiredDocs.cccdBack) missing.push("cccd_back");
  if (!requiredDocs.studentCard) missing.push("student_card");
  return missing;
};

export const canSubmitForm = (requiredDocs) => {
  return requiredDocs.cccdFront && 
         requiredDocs.cccdBack && 
         requiredDocs.studentCard;
};

export const isValidStatusTransition = (currentStatus, newStatus) => {
  return ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus);
};

export const buildPaginationResponse = (data, page, limit, total) => ({
  data,
  pagination: {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
    pages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1
  }
});
