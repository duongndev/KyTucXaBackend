import Registration from "../models/registration.model.js";
import Student from "../models/student.model.js";
import KTXConfig from "../models/ktxConfig.model.js";
import Room from "../models/room.model.js";
import { body, validationResult } from "express-validator";

// Validate registration creation
export const validateRegistrationCreation = [
  body('roomPreferences.preferredRoomType')
    .optional()
    .isIn(['single', 'double', 'triple', 'quad'])
    .withMessage('Loại phòng không hợp lệ'),
  
  body('roomPreferences.preferredFloor')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Tầng phải từ 1 đến 20'),
  
  body('roomPreferences.specialRequirements')
    .optional()
    .isArray()
    .withMessage('Yêu cầu đặc biệt phải là mảng'),
  
  body('roomPreferences.notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Ghi chú không quá 1000 ký tự'),
  
  body('priorityCategory')
    .optional()
    .isIn(['regular', 'priority', 'special_priority'])
    .withMessage('Danh mục ưu tiên không hợp lệ'),
  
  body('priorityReason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Lý do ưu tiên không quá 500 ký tự'),
  
  body('studentNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Ghi chú sinh viên không quá 1000 ký tự'),
  
  // Custom validation
  body().custom(async (value, { req }) => {
    try {
      // Check if student exists and is active
      const student = await Student.findOne({ userId: req.user.id });
      if (!student) {
        throw new Error('Không tìm thấy thông tin sinh viên');
      }
      
      if (student.status !== 'active') {
        throw new Error('Tài khoản sinh viên không hoạt động');
      }
      
      // Check if student already has active registration
      const existingRegistration = await Registration.findOne({
        student: student._id,
        status: { $in: ['draft', 'submitted', 'under_review', 'approved', 'payment_pending'] }
      });
      
      if (existingRegistration) {
        throw new Error('Bạn đã có đơn đăng ký đang hoạt động');
      }
      
      // Check if registration period is open
      const ktxConfig = await KTXConfig.findOne({
        'registrationPeriod.startDate': { $lte: new Date() },
        'registrationPeriod.endDate': { $gte: new Date() }
      });
      
      if (!ktxConfig) {
        throw new Error('Kỳ đăng ký chưa mở');
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  })
];

// Validate registration submission
export const validateRegistrationSubmission = [
  body().custom(async (value, { req }) => {
    try {
      const registration = await Registration.findById(req.params.id);
      if (!registration) {
        throw new Error('Không tìm thấy đơn đăng ký');
      }
      
      // Check authorization
      const student = await Student.findOne({ userId: req.user.id });
      if (!student || registration.student.toString() !== student._id.toString()) {
        throw new Error('Không có quyền truy cập đơn đăng ký này');
      }
      
      // Check if registration is in draft status
      if (registration.status !== 'draft') {
        throw new Error('Đơn đăng ký không thể nộp ở trạng thái hiện tại');
      }
      
      // Check if all required documents are uploaded
      if (!registration.hasAllRequiredDocuments) {
        throw new Error('Vui lòng tải lên tất cả tài liệu bắt buộc trước khi nộp đơn');
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  })
];

// Validate document upload
export const validateDocumentUpload = [
  body('docType')
    .isIn([
      'application_form', 'student_card', 'id_card', 'admission_letter', 
      'photo', 'health_certificate', 'commitment_form', 'poverty_certificate',
      'disability_certificate', 'ethnic_minority', 'martyr_family', 'other'
    ])
    .withMessage('Loại tài liệu không hợp lệ'),
  
  body('fileName')
    .notEmpty()
    .withMessage('Tên file không được để trống'),
  
  body('fileUrl')
    .isURL()
    .withMessage('URL file không hợp lệ'),
  
  // Custom validation
  body().custom(async (value, { req }) => {
    try {
      const registration = await Registration.findById(req.params.id);
      if (!registration) {
        throw new Error('Không tìm thấy đơn đăng ký');
      }
      
      // Check authorization
      const student = await Student.findOne({ userId: req.user.id });
      if (!student || registration.student.toString() !== student._id.toString()) {
        throw new Error('Không có quyền tải tài liệu cho đơn đăng ký này');
      }
      
      // Check if registration is still editable
      if (!['draft', 'submitted'].includes(registration.status)) {
        throw new Error('Không thể tải tài liệu ở trạng thái đơn đăng ký hiện tại');
      }
      
      // Check if document type already exists (for required documents)
      const { docType } = req.body;
      const existingDoc = registration.documents.find(doc => doc.type === docType);
      if (existingDoc && ['application_form', 'student_card', 'id_card', 'photo'].includes(docType)) {
        throw new Error('Tài liệu bắt buộc này đã được tải lên');
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  })
];

// Validate registration review (Admin)
export const validateRegistrationReview = [
  body('action')
    .isIn(['approve', 'reject'])
    .withMessage('Hành động phải là approve hoặc reject'),
  
  body('reviewNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Ghi chú xem xét không quá 1000 ký tự'),
  
  body('rejectionReason')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Lý do từ chối không quá 1000 ký tự'),
  
  body('approvedRoom')
    .optional()
    .isMongoId()
    .withMessage('ID phòng không hợp lệ'),
  
  // Custom validation
  body().custom(async (value, { req }) => {
    try {
      const registration = await Registration.findById(req.params.id);
      if (!registration) {
        throw new Error('Không tìm thấy đơn đăng ký');
      }
      
      if (registration.status !== 'under_review') {
        throw new Error('Đơn đăng ký không đang được xem xét');
      }
      
      const { action, approvedRoom } = req.body;
      
      if (action === 'approve' && approvedRoom) {
        // Check if room exists and is available
        const room = await Room.findById(approvedRoom);
        if (!room) {
          throw new Error('Không tìm thấy phòng');
        }
        
        if (room.status !== 'available') {
          throw new Error('Phòng không sẵn sàng');
        }
        
        // Check room capacity
        const currentOccupancy = room.currentOccupancy || 0;
        if (currentOccupancy >= room.capacity) {
          throw new Error('Phòng đã đầy');
        }
      }
      
      if (action === 'reject' && !req.body.rejectionReason) {
        throw new Error('Vui lòng cung cấp lý do từ chối');
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  })
];

// Validate registration status update (Admin)
export const validateStatusUpdate = [
  body('status')
    .isIn(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'payment_pending', 'completed', 'cancelled'])
    .withMessage('Trạng thái không hợp lệ'),
  
  body('notes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Ghi chú không quá 2000 ký tự'),
  
  // Custom validation
  body().custom(async (value, { req }) => {
    try {
      const registration = await Registration.findById(req.params.id);
      if (!registration) {
        throw new Error('Không tìm thấy đơn đăng ký');
      }
      
      const { status } = req.body;
      
      // Validate status transitions
      const validTransitions = {
        'draft': ['submitted', 'cancelled'],
        'submitted': ['under_review', 'rejected', 'cancelled'],
        'under_review': ['approved', 'rejected', 'cancelled'],
        'approved': ['payment_pending', 'cancelled'],
        'payment_pending': ['completed', 'cancelled'],
        'completed': ['cancelled'],
        'rejected': [],
        'cancelled': []
      };
      
      if (!validTransitions[registration.status].includes(status)) {
        throw new Error(`Không thể chuyển từ ${registration.status} sang ${status}`);
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  })
];

// Validate document verification (Admin)
export const validateDocumentVerification = [
  body('status')
    .isIn(['verified', 'rejected'])
    .withMessage('Trạng thái phải là verified hoặc rejected'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Ghi chú không quá 500 ký tự'),
  
  // Custom validation
  body().custom(async (value, { req }) => {
    try {
      const registration = await Registration.findById(req.params.id);
      if (!registration) {
        throw new Error('Không tìm thấy đơn đăng ký');
      }
      
      const { docIndex } = req.params;
      const docIndexNum = parseInt(docIndex);
      
      if (isNaN(docIndexNum) || docIndexNum < 0 || docIndexNum >= registration.documents.length) {
        throw new Error('Không tìm thấy tài liệu');
      }
      
      const { status, notes } = req.body;
      
      if (status === 'rejected' && !notes) {
        throw new Error('Vui lòng cung cấp lý do từ chối tài liệu');
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  })
];

// Validate payment
export const validatePayment = [
  body('amount')
    .isNumeric()
    .withMessage('Số tiền phải là số')
    .isFloat({ min: 0.01 })
    .withMessage('Số tiền phải lớn hơn 0'),
  
  body('method')
    .isIn(['bank_transfer', 'cash', 'online', 'other'])
    .withMessage('Phương thức thanh toán không hợp lệ'),
  
  body('transactionId')
    .optional()
    .isString()
    .withMessage('Mã giao dịch phải là chuỗi'),
  
  // Custom validation
  body().custom(async (value, { req }) => {
    try {
      const registration = await Registration.findById(req.params.id);
      if (!registration) {
        throw new Error('Không tìm thấy đơn đăng ký');
      }
      
      // Check authorization
      const student = await Student.findOne({ userId: req.user.id });
      if (!student || registration.student.toString() !== student._id.toString()) {
        throw new Error('Không có quyền thêm thanh toán cho đơn đăng ký này');
      }
      
      if (registration.status !== 'payment_pending') {
        throw new Error('Đơn đăng ký không ở trạng thái chờ thanh toán');
      }
      
      const { amount } = req.body;
      
      if (amount > registration.paymentInfo.totalAmount) {
        throw new Error('Số tiền thanh toán không thể lớn hơn tổng số tiền');
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  })
];

// Validate check-in scheduling (Admin)
export const validateCheckInScheduling = [
  body('scheduledCheckInDate')
    .isISO8601()
    .withMessage('Ngày nhận phòng không hợp lệ')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date <= now) {
        throw new Error('Ngày nhận phòng phải trong tương lai');
      }
      return true;
    }),
  
  // Custom validation
  body().custom(async (value, { req }) => {
    try {
      const registration = await Registration.findById(req.params.id);
      if (!registration) {
        throw new Error('Không tìm thấy đơn đăng ký');
      }
      
      if (registration.status !== 'completed') {
        throw new Error('Đơn đăng ký phải hoàn thành trước khi nhận phòng');
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  })
];

// Check registration ownership
export const checkRegistrationOwnership = async (req, res, next) => {
  try {
    const registration = await Registration.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn đăng ký'
      });
    }
    
    // Admin can access all registrations
    if (req.user.role === 'admin') {
      req.registration = registration;
      return next();
    }
    
    // Check student ownership
    const student = await Student.findOne({ userId: req.user.id });
    if (!student || registration.student.toString() !== student._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền truy cập đơn đăng ký này'
      });
    }
    
    req.registration = registration;
    next();
  } catch (error) {
    console.error('Check registration ownership error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi kiểm tra quyền truy cập đơn đăng ký',
      error: error.message
    });
  }
};

// Check registration period
export const checkRegistrationPeriod = async (req, res, next) => {
  try {
    const ktxConfig = await KTXConfig.findOne({
      'registrationPeriod.startDate': { $lte: new Date() },
      'registrationPeriod.endDate': { $gte: new Date() }
    });
    
    if (!ktxConfig) {
      return res.status(400).json({
        success: false,
        message: 'Kỳ đăng ký chưa mở hoặc đã kết thúc'
      });
    }
    
    req.ktxConfig = ktxConfig;
    next();
  } catch (error) {
    console.error('Check registration period error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi kiểm tra kỳ đăng ký',
      error: error.message
    });
  }
};

// Validate registration statistics query
export const validateStatisticsQuery = [
  body('academicYear')
    .optional()
    .isString()
    .withMessage('Năm học phải là chuỗi'),
  
  body('semester')
    .optional()
    .isIn(['1', '2', '3', 'summer'])
    .withMessage('Học kỳ không hợp lệ')
];

// Handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    return res.status(400).json({
      success: false,
      message: 'Lỗi xác thực',
      errors: errorMessages
    });
  }
  
  next();
};

export default {
  validateRegistrationCreation,
  validateRegistrationSubmission,
  validateDocumentUpload,
  validateRegistrationReview,
  validateStatusUpdate,
  validateDocumentVerification,
  validatePayment,
  validateCheckInScheduling,
  checkRegistrationOwnership,
  checkRegistrationPeriod,
  validateStatisticsQuery,
  handleValidationErrors
};
