import { RegistrationDocument } from "../models/index.js";
import { User } from "../models/index.js";

// Check if user can access document
export const canAccessDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find document
    const document = await RegistrationDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài liệu"
      });
    }

    // Admin can access all documents
    if (userRole === 'admin') {
      req.document = document;
      return next();
    }

    // Check if user uploaded this document
    if (document.uploadedBy.toString() === userId) {
      req.document = document;
      return next();
    }

    // Check if user owns the student record this document belongs to
    if (document.owner.model === 'Student') {
      const student = await User.findById(document.owner.id);
      if (student && student.userId.toString() === userId) {
        req.document = document;
        return next();
      }
    }

    // Check if user owns the registration this document belongs to
    if (document.owner.model === 'Registration') {
      const registration = await (await import('../models/registration/registrationForm.model.js')).default.findById(document.owner.id).populate('student');
      if (registration && registration.student.userId.toString() === userId) {
        req.document = document;
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền truy cập tài liệu này"
    });

  } catch (error) {
    console.error("Document access check error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi kiểm tra quyền truy cập tài liệu"
    });
  }
};

// Check if user can modify document
export const canModifyDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find document
    const document = await RegistrationDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài liệu"
      });
    }

    // Admin can modify all documents
    if (userRole === 'admin') {
      req.document = document;
      return next();
    }

    // Only user who uploaded the document can modify it
    if (document.uploadedBy.toString() === userId) {
      req.document = document;
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền chỉnh sửa tài liệu này"
    });

  } catch (error) {
    console.error("Document modification check error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi kiểm tra quyền chỉnh sửa tài liệu"
    });
  }
};

// Check if user can delete document
export const canDeleteDocument = async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find document
    const document = await RegistrationDocument.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài liệu"
      });
    }

    // Admin can delete all documents
    if (userRole === 'admin') {
      req.document = document;
      return next();
    }

    // Only user who uploaded the document can delete it
    if (document.uploadedBy.toString() === userId) {
      req.document = document;
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền xóa tài liệu này"
    });

  } catch (error) {
    console.error("Document deletion check error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi kiểm tra quyền xóa tài liệu"
    });
  }
};

// Check if user can view student documents
export const canViewStudentDocuments = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Admin can view all student documents
    if (userRole === 'admin') {
      return next();
    }

    // Find student
    const student = await User.findOne({ studentId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thông tin sinh viên"
      });
    }

    // Check if user owns this student record
    if (student.userId.toString() === userId) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Bạn không có quyền xem tài liệu của sinh viên này"
    });

  } catch (error) {
    console.error("Student documents view check error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi kiểm tra quyền xem tài liệu sinh viên"
    });
  }
};
