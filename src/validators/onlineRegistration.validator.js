import Joi from 'joi';

// Validation schemas for online registration

// Step 1: Create online registration
export const createOnlineRegistrationSchema = Joi.object({
  permanentAddress: Joi.string().required().trim().min(10).max(500)
    .messages({
      'string.empty': 'Địa chỉ thường trú không được để trống',
      'string.min': 'Địa chỉ thường trú phải có ít nhất 10 ký tự',
      'string.max': 'Địa chỉ thường trú không được vượt quá 500 ký tự',
      'any.required': 'Địa chỉ thường trú là bắt buộc'
    }),
  
  currentAddress: Joi.string().optional().trim().max(500)
    .messages({
      'string.max': 'Địa chỉ hiện tại không được vượt quá 500 ký tự'
    }),
  
  phone: Joi.string().optional().trim().pattern(/^[0-9]{10,11}$/)
    .messages({
      'string.pattern.base': 'Số điện thoại không hợp lệ (10-11 số)',
      'string.empty': 'Số điện thoại không được để trống'
    }),
  
  academicYear: Joi.number().integer().min(1).max(6).default(1)
    .messages({
      'number.min': 'Năm học phải từ 1 đến 6',
      'number.max': 'Năm học phải từ 1 đến 6',
      'number.integer': 'Năm học phải là số nguyên'
    }),
  
  isPriority: Joi.boolean().default(false),
  
  priorityCategory: Joi.string().valid('regular', 'first_year', 'policy', 'remote', 'disability', 'other').default('regular')
    .messages({
      'any.only': 'Đối tượng ưu tiên không hợp lệ'
    }),
  
  priorityReason: Joi.string().optional().trim().max(500)
    .messages({
      'string.max': 'Lý do ưu tiên không được vượt quá 500 ký tự'
    }),
  
  preferredBuilding: Joi.string().optional().trim(),
  preferredFloor: Joi.number().optional().integer().min(1).max(20)
    .messages({
      'number.min': 'Tầng phải từ 1 đến 20',
      'number.max': 'Tầng phải từ 1 đến 20'
    }),
  
  preferredRoomType: Joi.string().valid('single', 'double', 'triple', 'quad').default('double')
    .messages({
      'any.only': 'Loại phòng không hợp lệ'
    }),
  
  preferredRoommates: Joi.array().optional().items(
    Joi.object({
      studentId: Joi.string().optional().trim(),
      name: Joi.string().optional().trim().max(100)
    })
  ).max(3)
    .messages({
      'array.max': 'Chỉ được chọn tối đa 3 bạn cùng phòng'
    }),
  
  specialRequirements: Joi.array().optional().items(
    Joi.string().max(100)
  ).max(5)
    .messages({
      'array.max': 'Chỉ được thêm tối đa 5 yêu cầu đặc biệt'
    }),
  
  notes: Joi.string().optional().trim().max(1000)
    .messages({
      'string.max': 'Ghi chú không được vượt quá 1000 ký tự'
    })
});

// Step 3: Electronic signature
export const signRegistrationFormSchema = Joi.object({
  signatureImageUrl: Joi.string().required().uri()
    .messages({
      'string.empty': 'URL chữ ký không được để trống',
      'string.uri': 'URL chữ ký không hợp lệ',
      'any.required': 'Chữ ký là bắt buộc'
    }),
  
  signatoryName: Joi.string().required().trim().min(2).max(100)
    .messages({
      'string.empty': 'Tên người ký không được để trống',
      'string.min': 'Tên người ký phải có ít nhất 2 ký tự',
      'string.max': 'Tên người ký không được vượt quá 100 ký tự',
      'any.required': 'Tên người ký là bắt buộc'
    })
});

// Document upload validation
export const uploadDocumentsSchema = Joi.object({
  // This is handled by multer middleware, but we can add additional validation
  documentTypes: Joi.array().optional().items(
    Joi.string().valid(
      'don_dang_ky_co_dau_truong',
      'cccd_mat_truoc',
      'cccd_mat_sau', 
      'the_sinh_vien',
      'giay_bao_nhap_hoc',
      'giay_to_uu_tien',
      'don_xin_noi_tru',
      'anh_3x4'
    )
  )
});

// Query parameters validation
export const getRegistrationStatusSchema = Joi.object({
  registrationId: Joi.string().required().pattern(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'ID đăng ký không hợp lệ',
      'any.required': 'ID đăng ký là bắt buộc'
    })
});

// Registration ID parameter validation
export const registrationIdParamSchema = Joi.object({
  registrationId: Joi.string().required().pattern(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'ID đăng ký không hợp lệ',
      'any.required': 'ID đăng ký là bắt buộc'
    })
});

// Priority category validation
export const validatePriorityCategory = (isPriority, priorityCategory, priorityReason) => {
  const errors = [];
  
  if (isPriority && !priorityCategory) {
    errors.push('Nếu là đối tượng ưu tiên, phải chọn loại ưu tiên');
  }
  
  if (priorityCategory !== 'regular' && !priorityReason?.trim()) {
    errors.push('Đối tượng ưu tiên phải có lý do');
  }
  
  return errors;
};

// Room preference validation
export const validateRoomPreferences = (preferredRoomType, preferredRoommates) => {
  const errors = [];
  
  if (preferredRoomType === 'single' && preferredRoommates?.length > 0) {
    errors.push('Phòng đơn không thể có bạn cùng phòng');
  }
  
  if (preferredRoomType === 'double' && preferredRoommates?.length > 1) {
    errors.push('Phòng đôi chỉ có tối đa 1 bạn cùng phòng');
  }
  
  if (preferredRoomType === 'triple' && preferredRoommates?.length > 2) {
    errors.push('Phòng ba chỉ có tối đa 2 bạn cùng phòng');
  }
  
  if (preferredRoomType === 'quad' && preferredRoommates?.length > 3) {
    errors.push('Phòng bốn chỉ có tối đa 3 bạn cùng phòng');
  }
  
  return errors;
};

// Document requirements validation
export const validateDocumentRequirements = (documents, isPriority) => {
  const errors = [];
  const docTypes = new Set(documents?.map(doc => doc.type) || []);
  
  // Required documents for everyone
  const requiredDocs = ['don_dang_ky_co_dau_truong', 'cccd_mat_truoc', 'cccd_mat_sau'];
  
  // Check ID documents (one of these is required)
  const hasStudentCard = docTypes.has('the_sinh_vien');
  const hasAdmissionLetter = docTypes.has('giay_bao_nhap_hoc');
  
  if (!hasStudentCard && !hasAdmissionLetter) {
    errors.push('Phải có thẻ sinh viên hoặc giấy báo nhập học');
  }
  
  // Check priority documents
  if (isPriority && !docTypes.has('giay_to_uu_tien')) {
    errors.push('Đối tượng ưu tiên phải có giấy tờ ưu tiên');
  }
  
  // Check required documents
  requiredDocs.forEach(docType => {
    if (!docTypes.has(docType)) {
      errors.push(`Thiếu tài liệu bắt buộc: ${docType}`);
    }
  });
  
  return errors;
};

// Phone number validation
export const validatePhoneNumber = (phone) => {
  const errors = [];
  
  if (!phone || !phone.trim()) {
    errors.push('Số điện thoại không được để trống');
    return errors;
  }
  
  const phoneRegex = /^[0-9]{10,11}$/;
  if (!phoneRegex.test(phone.trim())) {
    errors.push('Số điện thoại không hợp lệ (10-11 số)');
  }
  
  return errors;
};

// Address validation
export const validateAddress = (permanentAddress, currentAddress) => {
  const errors = [];
  
  if (!permanentAddress || !permanentAddress.trim()) {
    errors.push('Địa chỉ thường trú không được để trống');
  } else if (permanentAddress.trim().length < 10) {
    errors.push('Địa chỉ thường trú phải có ít nhất 10 ký tự');
  } else if (permanentAddress.trim().length > 500) {
    errors.push('Địa chỉ thường trú không được vượt quá 500 ký tự');
  }
  
  if (currentAddress && currentAddress.trim().length > 500) {
    errors.push('Địa chỉ hiện tại không được vượt quá 500 ký tự');
  }
  
  return errors;
};

// Academic year validation
export const validateAcademicYear = (academicYear) => {
  const errors = [];
  
  if (academicYear === null || academicYear === undefined) {
    errors.push('Năm học không được để trống');
    return errors;
  }
  
  const year = parseInt(academicYear);
  if (isNaN(year) || year < 1 || year > 6) {
    errors.push('Năm học phải từ 1 đến 6');
  }
  
  return errors;
};

// Comprehensive validation for registration data
export const validateRegistrationData = (data) => {
  const errors = [];
  
  // Validate address
  errors.push(...validateAddress(data.permanentAddress, data.currentAddress));
  
  // Validate phone
  errors.push(...validatePhoneNumber(data.phone));
  
  // Validate academic year
  errors.push(...validateAcademicYear(data.academicYear));
  
  // Validate priority category
  errors.push(...validatePriorityCategory(data.isPriority, data.priorityCategory, data.priorityReason));
  
  // Validate room preferences
  errors.push(...validateRoomPreferences(data.preferredRoomType, data.preferredRoommates));
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export default {
  createOnlineRegistrationSchema,
  signRegistrationFormSchema,
  uploadDocumentsSchema,
  getRegistrationStatusSchema,
  registrationIdParamSchema,
  validatePriorityCategory,
  validateRoomPreferences,
  validateDocumentRequirements,
  validatePhoneNumber,
  validateAddress,
  validateAcademicYear,
  validateRegistrationData
};
