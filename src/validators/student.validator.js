import Joi from 'joi';

// Student ID validation
export const studentIdSchema = Joi.string()
  .pattern(/^[A-Z0-9]{8,15}$/)
  .required()
  .messages({
    'string.pattern.base': 'Mã sinh viên phải gồm 8-15 ký tự chữ hoa và số',
    'any.required': 'Mã sinh viên là bắt buộc'
  });

// Faculty validation
export const facultySchema = Joi.string()
  .valid('CNTT', 'KTPM', 'KHMT', 'KT', 'QLKD', 'TCNH', 'NN', 'SP', 'XD', 'DT', 'CK', 'Other')
  .required()
  .messages({
    'any.only': 'Khoa không hợp lệ',
    'any.required': 'Khoa là bắt buộc'
  });

// Academic year validation
export const academicYearSchema = Joi.number()
  .integer()
  .min(1)
  .max(6)
  .required()
  .messages({
    'number.base': 'Năm học phải là số',
    'number.integer': 'Năm học phải là số nguyên',
    'number.min': 'Năm học phải từ 1 đến 6',
    'number.max': 'Năm học phải từ 1 đến 6',
    'any.required': 'Năm học là bắt buộc'
  });

// Emergency contact validation
export const emergencyContactSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.min': 'Tên người liên hệ phải ít nhất 2 ký tự',
      'string.max': 'Tên người liên hệ không quá 50 ký tự',
      'any.required': 'Tên người liên hệ là bắt buộc'
    }),
  relationship: Joi.string()
    .valid('Father', 'Mother', 'Sibling', 'Relative', 'Friend', 'Other')
    .required()
    .messages({
      'any.only': 'Mối quan hệ không hợp lệ',
      'any.required': 'Mối quan hệ là bắt buộc'
    }),
  phone: Joi.string()
    .pattern(/^(0|\+84)[0-9]{9,10}$/)
    .required()
    .messages({
      'string.pattern.base': 'Số điện thoại không hợp lệ',
      'any.required': 'Số điện thoại là bắt buộc'
    }),
  address: Joi.string()
    .max(200)
    .allow('')
    .messages({
      'string.max': 'Địa chỉ không quá 200 ký tự'
    })
});

// Medical information validation
export const medicalInfoSchema = Joi.object({
  bloodType: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .optional(),
  allergies: Joi.array()
    .items(Joi.string().max(100))
    .max(10)
    .optional()
    .messages({
      'array.max': 'Tối đa 10 loại dị ứng'
    }),
  chronicDiseases: Joi.array()
    .items(Joi.string().max(100))
    .max(10)
    .optional()
    .messages({
      'array.max': 'Tối đa 10 loại bệnh mãn tính'
    }),
  medications: Joi.array()
    .items(Joi.string().max(100))
    .max(10)
    .optional()
    .messages({
      'array.max': 'Tối đa 10 loại thuốc'
    }),
  emergencyNotes: Joi.string()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Ghi chú y tế không quá 500 ký tự'
    })
});

// Room preferences validation
export const roomPreferencesSchema = Joi.object({
  preferredRoommates: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .max(3)
    .optional()
    .messages({
      'array.max': 'Tối đa 3 bạn cùng phòng mong muốn'
    }),
  preferredFloor: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .optional()
    .messages({
      'number.min': 'Tầng phải từ 1 trở lên',
      'number.max': 'Tầng không quá 20'
    }),
  preferredBuilding: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  specialRequirements: Joi.array()
    .items(Joi.string().max(100))
    .max(5)
    .optional()
    .messages({
      'array.max': 'Tối đa 5 yêu cầu đặc biệt'
    }),
  notes: Joi.string()
    .max(300)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Ghi chú không quá 300 ký tự'
    })
});

// Create student validation
export const createStudentSchema = Joi.object({
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'ID người dùng không hợp lệ',
      'any.required': 'ID người dùng là bắt buộc'
    }),
  studentId: studentIdSchema,
  faculty: facultySchema,
  major: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Chuyên ngành phải ít nhất 2 ký tự',
      'string.max': 'Chuyên ngành không quá 100 ký tự',
      'any.required': 'Chuyên ngành là bắt buộc'
    }),
  class: Joi.string()
    .min(2)
    .max(20)
    .required()
    .messages({
      'string.min': 'Lớp phải ít nhất 2 ký tự',
      'string.max': 'Lớp không quá 20 ký tự',
      'any.required': 'Lớp là bắt buộc'
    }),
  academicYear: academicYearSchema,
  enrollmentDate: Joi.date()
    .max('now')
    .required()
    .messages({
      'date.max': 'Ngày nhập học không thể trong tương lai',
      'any.required': 'Ngày nhập học là bắt buộc'
    }),
  expectedGraduationDate: Joi.date()
    .min(Joi.ref('enrollmentDate'))
    .required()
    .messages({
      'date.min': 'Ngày tốt nghiệp dự kiến phải sau ngày nhập học',
      'any.required': 'Ngày tốt nghiệp dự kiến là bắt buộc'
    }),
  emergencyContact: emergencyContactSchema.required(),
  medicalInfo: medicalInfoSchema.optional(),
  roomPreferences: roomPreferencesSchema.optional()
});

// Update student validation
export const updateStudentSchema = Joi.object({
  faculty: facultySchema.optional(),
  major: Joi.string()
    .min(2)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Chuyên ngành phải ít nhất 2 ký tự',
      'string.max': 'Chuyên ngành không quá 100 ký tự'
    }),
  class: Joi.string()
    .min(2)
    .max(20)
    .optional()
    .messages({
      'string.min': 'Lớp phải ít nhất 2 ký tự',
      'string.max': 'Lớp không quá 20 ký tự'
    }),
  academicYear: academicYearSchema.optional(),
  enrollmentDate: Joi.date()
    .max('now')
    .optional()
    .messages({
      'date.max': 'Ngày nhập học không thể trong tương lai'
    }),
  expectedGraduationDate: Joi.date()
    .min(Joi.ref('enrollmentDate'))
    .optional()
    .messages({
      'date.min': 'Ngày tốt nghiệp dự kiến phải sau ngày nhập học'
    }),
  emergencyContact: emergencyContactSchema.optional(),
  medicalInfo: medicalInfoSchema.optional(),
  roomPreferences: roomPreferencesSchema.optional(),
  status: Joi.string()
    .valid('active', 'inactive', 'graduated', 'suspended', 'withdrawn')
    .optional(),
  ktxStatus: Joi.string()
    .valid('not_checked_in', 'checked_in', 'checked_out', 'temporary_leave')
    .optional(),
  adminNotes: Joi.string()
    .max(1000)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Ghi chú admin không quá 1000 ký tự'
    }),
  privateNotes: Joi.string()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Ghi chú riêng không quá 500 ký tự'
    })
});

// Check-in validation
export const checkInSchema = Joi.object({
  roomId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'ID phòng không hợp lệ',
      'any.required': 'ID phòng là bắt buộc'
    }),
  contractId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'ID hợp đồng không hợp lệ',
      'any.required': 'ID hợp đồng là bắt buộc'
    })
});

// Check-out validation
export const checkOutSchema = Joi.object({
  reason: Joi.string()
    .max(200)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Lý do check-out không quá 200 ký tự'
    })
});

// Disciplinary record validation
export const disciplinaryRecordSchema = Joi.object({
  type: Joi.string()
    .valid('warning', 'probation', 'suspension')
    .required()
    .messages({
      'any.only': 'Loại kỷ luật không hợp lệ',
      'any.required': 'Loại kỷ luật là bắt buộc'
    }),
  reason: Joi.string()
    .min(5)
    .max(500)
    .required()
    .messages({
      'string.min': 'Lý do kỷ luật phải ít nhất 5 ký tự',
      'string.max': 'Lý do kỷ luật không quá 500 ký tự',
      'any.required': 'Lý do kỷ luật là bắt buộc'
    }),
  notes: Joi.string()
    .max(500)
    .allow('')
    .optional()
    .messages({
      'string.max': 'Ghi chú không quá 500 ký tự'
    })
});

// Query parameters validation
export const studentQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.min': 'Trang phải từ 1 trở lên'
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .messages({
      'number.min': 'Giới hạn phải từ 1 trở lên',
      'number.max': 'Giới hạn không quá 100'
    }),
  faculty: Joi.string()
    .valid('CNTT', 'KTPM', 'KHMT', 'KT', 'QLKD', 'TCNH', 'NN', 'SP', 'XD', 'DT', 'CK', 'Other')
    .optional(),
  major: Joi.string()
    .max(100)
    .optional(),
  class: Joi.string()
    .max(20)
    .optional(),
  status: Joi.string()
    .valid('active', 'inactive', 'graduated', 'suspended', 'withdrawn')
    .optional(),
  ktxStatus: Joi.string()
    .valid('not_checked_in', 'checked_in', 'checked_out', 'temporary_leave')
    .optional(),
  search: Joi.string()
    .max(100)
    .optional(),
  sortBy: Joi.string()
    .valid('createdAt', 'studentId', 'faculty', 'major', 'class', 'academicYear', 'checkInDate')
    .default('createdAt')
    .optional(),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional(),
  startDate: Joi.date()
    .optional(),
  endDate: Joi.date()
    .min(Joi.ref('startDate'))
    .optional()
    .messages({
      'date.min': 'Ngày kết thúc phải sau ngày bắt đầu'
    })
});

// Validation middleware
export const validateStudent = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    next();
  };
};

export const validateStudentQuery = (req, res, next) => {
  const { error, value } = studentQuerySchema.validate(req.query, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Query validation failed',
      errors
    });
  }
  
  req.query = value;
  next();
};
