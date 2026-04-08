import Joi from 'joi';

// Field validation schema
export const fieldSchema = Joi.object({
  id: Joi.string()
    .required()
    .messages({
      'any.required': 'ID trường là bắt buộc'
    }),
    
  type: Joi.string()
    .valid(
      'text', 'number', 'email', 'phone', 'date', 'time',
      'textarea', 'select', 'radio', 'checkbox', 'file',
      'image', 'signature', 'address', 'range'
    )
    .required()
    .messages({
      'any.only': 'Loại trường không hợp lệ',
      'any.required': 'Loại trường là bắt buộc'
    }),
    
  label: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.min': 'Nhãn trường không được để trống',
      'string.max': 'Nhãn trường không quá 200 ký tự',
      'any.required': 'Nhãn trường là bắt buộc'
    }),
    
  placeholder: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Placeholder không quá 500 ký tự'
    }),
    
  required: Joi.boolean()
    .default(false)
    .optional(),
    
  validation: Joi.object({
    min: Joi.number()
      .min(0)
      .optional(),
    max: Joi.number()
      .min(0)
      .optional(),
    minLength: Joi.number()
      .min(0)
      .optional(),
    maxLength: Joi.number()
      .min(0)
      .optional(),
    pattern: Joi.string()
      .optional(),
    customRules: Joi.array()
      .items(Joi.string())
      .max(10)
      .optional(),
    message: Joi.string()
      .max(200)
      .optional()
  }).optional(),
  
  options: Joi.array()
    .items(Joi.object({
      value: Joi.string().required(),
      label: Joi.string().required(),
      selected: Joi.boolean().default(false)
    }))
    .max(50)
    .optional(),
    
  conditional: Joi.object({
    showWhen: Joi.string().optional(),
    dependsOn: Joi.string().optional(),
    value: Joi.alternatives().try(
      Joi.string(),
      Joi.number(),
      Joi.boolean(),
      Joi.array()
    ).optional()
  }).optional(),
  
  defaultValue: Joi.alternatives()
    .try(Joi.string(), Joi.number(), Joi.boolean(), Joi.array())
    .optional(),
    
  className: Joi.string()
    .max(100)
    .optional(),
    
  style: Joi.object()
    .optional(),
    
  order: Joi.number()
    .min(0)
    .max(1000)
    .optional(),
    
  group: Joi.string()
    .max(50)
    .optional(),
    
  readonly: Joi.boolean()
    .default(false)
    .optional(),
    
  disabled: Joi.boolean()
    .default(false)
    .optional(),
    
  visible: Joi.boolean()
    .default(true)
    .optional()
});

// Layout section schema
export const layoutSectionSchema = Joi.object({
  id: Joi.string()
    .required(),
  title: Joi.string()
    .max(200)
    .optional(),
  description: Joi.string()
    .max(500)
    .optional()
    .allow(''),
  fields: Joi.array()
    .items(Joi.string())
    .required(),
  order: Joi.number()
    .min(0)
    .optional(),
  collapsible: Joi.boolean()
    .default(false)
    .optional(),
  collapsed: Joi.boolean()
    .default(false)
    .optional()
});

// Layout schema
export const layoutSchema = Joi.object({
  type: Joi.string()
    .valid('single_column', 'two_column', 'three_column', 'custom')
    .default('single_column')
    .optional(),
  sections: Joi.array()
    .items(layoutSectionSchema)
    .max(20)
    .optional(),
  customCSS: Joi.string()
    .max(10000)
    .optional(),
  customJS: Joi.string()
    .max(10000)
    .optional()
});

// File upload configuration schema
export const fileUploadConfigSchema = Joi.object({
  allowedTypes: Joi.array()
    .items(Joi.string())
    .max(20)
    .optional(),
  maxSize: Joi.number()
    .min(1024) // 1KB minimum
    .max(50 * 1024 * 1024) // 50MB maximum
    .optional(),
  maxFiles: Joi.number()
    .min(1)
    .max(50)
    .optional(),
  uploadPath: Joi.string()
    .max(500)
    .optional(),
  requireSignature: Joi.boolean()
    .default(false)
    .optional(),
  requireStamp: Joi.boolean()
    .default(false)
    .optional()
});

// PDF configuration schema
export const pdfConfigSchema = Joi.object({
  template: Joi.string()
    .max(500)
    .optional(),
  header: Joi.object({
    title: Joi.string().max(200).optional(),
    subtitle: Joi.string().max(500).optional(),
    logo: Joi.string().max(500).optional()
  }).optional(),
  footer: Joi.object({
    text: Joi.string().max(500).optional(),
    pageNumber: Joi.boolean().default(true).optional()
  }).optional(),
  watermark: Joi.string()
    .max(200)
    .optional(),
  pageSize: Joi.string()
    .valid('A4', 'A3', 'Letter')
    .default('A4')
    .optional(),
  orientation: Joi.string()
    .valid('portrait', 'landscape')
    .default('portrait')
    .optional(),
  margins: Joi.object({
    top: Joi.number().min(0).optional(),
    right: Joi.number().min(0).optional(),
    bottom: Joi.number().min(0).optional(),
    left: Joi.number().min(0).optional()
  }).optional()
});

// Workflow step schema
export const workflowStepSchema = Joi.object({
  id: Joi.string()
    .required(),
  name: Joi.string()
    .max(100)
    .required(),
  description: Joi.string()
    .max(500)
    .optional(),
  type: Joi.string()
    .valid('form_fill', 'document_upload', 'review', 'approval')
    .required(),
  required: Joi.boolean()
    .default(true)
    .optional(),
  order: Joi.number()
    .min(0)
    .optional(),
  assignTo: Joi.string()
    .valid('student', 'admin', 'reviewer')
    .optional(),
  conditions: Joi.array()
    .items(Joi.string())
    .max(10)
    .optional(),
  autoProceed: Joi.boolean()
    .default(false)
    .optional()
});

// Workflow notification schema
export const workflowNotificationSchema = Joi.object({
  event: Joi.string()
    .valid('submitted', 'approved', 'rejected', 'under_review', 'verified')
    .required(),
  recipients: Joi.array()
    .items(Joi.string().valid('student', 'admin', 'reviewer'))
    .min(1)
    .required(),
  template: Joi.string()
    .max(100)
    .optional(),
  enabled: Joi.boolean()
    .default(true)
    .optional()
});

// Create FormTemplate validation schema
export const createFormTemplateSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.min': 'Tên mẫu không được để trống',
      'string.max': 'Tên mẫu không quá 200 ký tự',
      'any.required': 'Tên mẫu là bắt buộc'
    }),
    
  description: Joi.string()
    .max(500)
    .optional()
    .allow(''),
    
  category: Joi.string()
    .valid('housing_application', 'registration', 'contract', 'other')
    .required()
    .messages({
      'any.only': 'Danh mục không hợp lệ',
      'any.required': 'Danh mục là bắt buộc'
    }),
    
  version: Joi.string()
    .pattern(/^\d+\.\d+(\.\d+)?$/)
    .default('1.0')
    .optional()
    .messages({
      'string.pattern.base': 'Phiên bản không hợp lệ (ví dụ: 1.0, 1.2.3)'
    }),
    
  fields: Joi.array()
    .items(fieldSchema)
    .min(1)
    .required()
    .messages({
      'array.min': 'Phải có ít nhất 1 trường',
      'any.required': 'Các trường là bắt buộc'
    }),
    
  layout: layoutSchema.optional(),
  fileUploadConfig: fileUploadConfigSchema.optional(),
  pdfConfig: pdfConfigSchema.optional(),
  
  workflow: Joi.object({
    steps: Joi.array()
      .items(workflowStepSchema)
      .max(10)
      .optional(),
    notifications: Joi.array()
      .items(workflowNotificationSchema)
      .max(20)
      .optional()
  }).optional(),
  
  status: Joi.string()
    .valid('draft', 'active', 'archived', 'deprecated')
    .default('draft')
    .optional(),
    
  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional(),
    
  language: Joi.string()
    .max(10)
    .default('vi')
    .optional(),
    
  permissions: Joi.object({
    canView: Joi.array().items(Joi.string()).optional(),
    canEdit: Joi.array().items(Joi.string()).optional(),
    canSubmit: Joi.array().items(Joi.string()).optional(),
    canReview: Joi.array().items(Joi.string()).optional()
  }).optional()
});

// Update FormTemplate validation schema
export const updateFormTemplateSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(200)
    .optional(),
  description: Joi.string()
    .max(500)
    .optional()
    .allow(''),
  category: Joi.string()
    .valid('housing_application', 'registration', 'contract', 'other')
    .optional(),
  version: Joi.string()
    .pattern(/^\d+\.\d+(\.\d+)?$/)
    .optional(),
  fields: Joi.array()
    .items(fieldSchema)
    .min(1)
    .optional(),
  layout: layoutSchema.optional(),
  fileUploadConfig: fileUploadConfigSchema.optional(),
  pdfConfig: pdfConfigSchema.optional(),
  workflow: Joi.object({
    steps: Joi.array()
      .items(workflowStepSchema)
      .max(10)
      .optional(),
    notifications: Joi.array()
      .items(workflowNotificationSchema)
      .max(20)
      .optional()
  }).optional(),
  status: Joi.string()
    .valid('draft', 'active', 'archived', 'deprecated')
    .optional(),
  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional(),
  language: Joi.string()
    .max(10)
    .optional(),
  permissions: Joi.object({
    canView: Joi.array().items(Joi.string()).optional(),
    canEdit: Joi.array().items(Joi.string()).optional(),
    canSubmit: Joi.array().items(Joi.string()).optional(),
    canReview: Joi.array().items(Joi.string()).optional()
  }).optional()
});

// FormTemplate query validation schema
export const formTemplateQuerySchema = Joi.object({
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
  category: Joi.string()
    .valid('housing_application', 'registration', 'contract', 'other')
    .optional(),
  status: Joi.string()
    .valid('draft', 'active', 'archived', 'deprecated')
    .optional(),
  search: Joi.string()
    .max(100)
    .optional(),
  tags: Joi.alternatives()
    .try(Joi.string(), Joi.array().items(Joi.string()))
    .optional(),
  sortBy: Joi.string()
    .valid('name', 'category', 'status', 'createdAt', 'updatedAt', 'usage.totalSubmissions')
    .default('createdAt')
    .optional(),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional()
});

// FormSubmission validation schema
export const formSubmissionSchema = Joi.object({
  templateId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'ID mẫu không hợp lệ',
      'any.required': 'ID mẫu là bắt buộc'
    }),
    
  formData: Joi.object()
    .required()
    .messages({
      'any.required': 'Dữ liệu form là bắt buộc'
    }),
    
  registrationId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
    
  attachments: Joi.array()
    .items(Joi.object({
      type: Joi.string()
        .valid('photo', 'document', 'signature', 'certificate', 'other')
        .required(),
      name: Joi.string().max(200).optional(),
      originalName: Joi.string().max(200).optional(),
      mimeType: Joi.string().max(100).optional(),
      size: Joi.number().min(0).optional(),
      url: Joi.string().uri().optional(),
      publicId: Joi.string().max(200).optional(),
      description: Joi.string().max(500).optional(),
      metadata: Joi.object().optional()
    }))
    .max(20)
    .optional(),
    
  stampedDocument: Joi.object({
    fileUrl: Joi.string().uri().required(),
    fileName: Joi.string().max(200).required(),
    publicId: Joi.string().max(200).optional(),
    fileSize: Joi.number().min(0).optional(),
    mimeType: Joi.string().max(100).optional(),
    verificationNotes: Joi.string().max(1000).optional(),
    stampVerificationCode: Joi.string().max(100).optional()
  }).optional(),
    
  tags: Joi.array()
    .items(Joi.string().max(50))
    .max(10)
    .optional(),
    
  priority: Joi.string()
    .valid('low', 'normal', 'high', 'urgent')
    .default('normal')
    .optional()
});

// Draft submission schema
export const draftSubmissionSchema = Joi.object({
  templateId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required(),
  formData: Joi.object().required(),
  autoSave: Joi.boolean().default(true).optional()
});

// FormSubmission query validation schema
export const formSubmissionQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10),
  templateId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  registrationId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  status: Joi.string()
    .valid('draft', 'document_uploaded', 'stamp_verified', 'physical_submitted', 'verified', 'under_review', 'approved', 'rejected', 'cancelled')
    .optional(),
  search: Joi.string()
    .max(100)
    .optional(),
  tags: Joi.alternatives()
    .try(Joi.string(), Joi.array().items(Joi.string()))
    .optional(),
  priority: Joi.string()
    .valid('low', 'normal', 'high', 'urgent')
    .optional(),
  sortBy: Joi.string()
    .valid('createdAt', 'updatedAt', 'status', 'priority', 'statistics.totalTimeSpent')
    .default('createdAt')
    .optional(),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date()
    .min(Joi.ref('startDate'))
    .optional()
});

// Review submission schema
export const reviewSubmissionSchema = Joi.object({
  decision: Joi.string()
    .valid('approved', 'rejected', 'needs_revision')
    .required(),
  reviewNotes: Joi.string()
    .max(2000)
    .optional(),
  rejectionReasons: Joi.array()
    .items(Joi.string().max(200))
    .max(10)
    .optional(),
  approvedFields: Joi.array()
    .items(Joi.string())
    .max(50)
    .optional(),
  rejectedFields: Joi.array()
    .items(Joi.string())
    .max(50)
    .optional(),
  checklist: Joi.array()
    .items(Joi.object({
      item: Joi.string().required(),
      completed: Joi.boolean().required(),
      notes: Joi.string().max(500).optional()
    }))
    .max(20)
    .optional()
});

// Physical submission schema
export const physicalSubmissionSchema = Joi.object({
  submissionCode: Joi.string()
    .max(50)
    .optional(),
  notes: Joi.string()
    .max(1000)
    .optional(),
  discrepancies: Joi.array()
    .items(Joi.string().max(200))
    .max(10)
    .optional(),
  matched: Joi.boolean()
    .default(false)
    .optional()
});

// Validation middleware
export const validateFormTemplate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    
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
    
    req.body = value;
    next();
  };
};

export const validateFormSubmission = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    
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
    
    req.body = value;
    next();
  };
};

export const validateFormTemplateQuery = (req, res, next) => {
  const { error, value } = formTemplateQuerySchema.validate(req.query, { abortEarly: false });
  
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

export const validateFormSubmissionQuery = (req, res, next) => {
  const { error, value } = formSubmissionQuerySchema.validate(req.query, { abortEarly: false });
  
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
