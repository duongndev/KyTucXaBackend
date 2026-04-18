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
  "photo_3x4",
  "other"
];

export const DOCUMENT_TYPE_MAPPING = {
  'cccd_front': 'cccdFront',
  'cccd_back': 'cccdBack',
  'student_card': 'studentCard',
  'priority_proof': 'priorityDoc',
  'stamped_form': 'stampedForm',
  'photo_3x4': 'photo3x4'
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
  if (!requiredDocs.photo3x4) missing.push("photo_3x4");
  return missing;
};

export const canSubmitForm = (requiredDocs) => {
  return requiredDocs.cccdFront && 
         requiredDocs.cccdBack && 
         requiredDocs.studentCard &&
         requiredDocs.photo3x4;
};

export const isValidStatusTransition = (currentStatus, newStatus) => {
  return ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
};

// ============ PROGRESS CALCULATION ============

export const calculateOverallProgress = (form) => {
  const completedStepsCount = form.completedSteps?.length || 0;
  const status = form.status;

  // User progress: 15% mỗi step (max 60% khi submit)
  const userProgress = Math.min(completedStepsCount * 15, 60);

  // Admin progress: 40% còn lại phân bổ theo status
  const adminStageWeights = {
    draft: 0,           // Chưa submit
    submitted: 0,       // Vừa nộp, chờ admin xác nhận
    pending: 15,        // Admin đã xác nhận, chờ kiểm tra
    missing_document: 10, // Cần bổ sung tài liệu
    resubmitted: 12,    // Đã bổ sung, chờ xem lại
    processing: 25,     // Đang xử lý
    pending_offline: 5, // Chờ nộp offline
    received_offline: 10, // Đã tiếp nhận offline
    approved: 40,       // Hoàn thành
    rejected: 40        // Kết thúc (không thành công)
  };

  const adminProgress = adminStageWeights[status] || 0;
  const totalProgress = Math.min(userProgress + adminProgress, 100);

  // Chi tiết các stage
  const stages = [
    { name: "Nhập đơn nội trú", percent: 15, completed: completedStepsCount >= 1, type: "user" },
    { name: "Nhập đơn tạm trú", percent: 15, completed: completedStepsCount >= 2, type: "user" },
    { name: "Upload tài liệu", percent: 15, completed: completedStepsCount >= 3, type: "user" },
    { name: "Ký và nộp đơn", percent: 15, completed: completedStepsCount >= 4, type: "user" },
    { name: "Admin xác nhận", percent: 15, completed: ["pending", "processing", "approved", "rejected"].includes(status), type: "admin" },
    { name: "Kiểm tra hồ sơ", percent: 15, completed: ["processing", "approved", "rejected"].includes(status), type: "admin" },
    { name: "Phê duyệt", percent: 10, completed: ["approved", "rejected"].includes(status), type: "admin" }
  ];

  // Xác định stage hiện tại
  let currentStage = stages.find(s => !s.completed)?.name || "Hoàn thành";
  if (status === "approved") currentStage = "Đã phê duyệt";
  if (status === "rejected") currentStage = "Đã từ chối";

  return {
    total: totalProgress,
    userProgress,
    adminProgress,
    currentStage,
    stages,
    statusBreakdown: {
      user: { completed: completedStepsCount, total: 4, percent: userProgress },
      admin: { status, percent: adminProgress }
    }
  };
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
