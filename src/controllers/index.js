// Domain-based Controllers - organized like models structure

// Auth
export { default as authController } from './auth/auth.controller.js';

// Building
export { default as buildingController } from './building/building.controller.js';
export { default as roomController } from './building/room.controller.js';

// Contract (includes billing, invoice, payment)
export { default as contractController } from './contract/contract.controller.js';
export { default as invoiceController } from './contract/invoice.controller.js';
export { default as paymentController } from './contract/payment.controller.js';
export { default as billingSplitController } from './contract/billingSplit.controller.js';
export { default as semesterInvoiceController } from './contract/semesterInvoice.controller.js';

// Maintenance
export { default as maintenanceController } from './maintenance/maintenance.controller.js';

// Notification
export { default as notificationController } from './notification/notification.controller.js';

// Registration
export { default as registrationController } from './registration/registration.controller.js';

// Room Assignment
export { default as roomAssignmentController } from './roomAssignment/roomAssignment.controller.js';

// Service
export { default as serviceController } from './service/service.controller.js';

// Student
export { default as studentController } from './student/student.controller.js';

// Upload
export { default as uploadController } from './upload/upload.controller.js';

// Utility
export { default as utilityController } from './utility/utility.controller.js';

// Audit Log
export { default as auditLogController } from './auditLog/auditLog.controller.js';

// Admin Controllers
export * as registrationAdminController from './admin/registrationAdmin.controller.js';
