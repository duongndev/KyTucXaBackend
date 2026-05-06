import express from 'express';
import * as registrationCtrl from '../controllers/registration/registration.controller.js';
import * as registrationAdminCtrl from '../controllers/admin/registrationAdmin.controller.js';
import { protect, authorize } from '../middlewares/auth.middlewares.js';
import {
  uploadImageMiddleware,
  handleUploadError
} from '../middlewares/cloudinaryUpload.middleware.js';

const router = express.Router();

// Get status & progress
router.get('/:id/status', registrationCtrl.getRegistrationStatus);

// Preview forms
router.get('/preview-residence/:id', registrationCtrl.previewResidenceFormHTML);
router.get('/preview-temporary/:id', registrationCtrl.previewTemporaryFormHTML);

// Student routes (protected)
router.use(protect);

// Create new registration form
router.post('/', registrationCtrl.createRegistrationForm);

// Step-based workflow
router.patch('/:id/step1', registrationCtrl.saveStep1);
router.patch('/:id/step2', registrationCtrl.saveStep2);

// Document upload — sensitive (CCCD / thẻ SV): multipart/form-data, field "image"
router.post(
  '/:id/documents/sensitive',
  uploadImageMiddleware,
  handleUploadError,
  registrationCtrl.uploadSensitiveDocumentHandler
);

// Document upload — thông thường (stamped_form, priority_proof): gửi fileUrl JSON
router.post('/:id/documents', registrationCtrl.uploadDocument);

// Submit form
router.post('/:id/submit', registrationCtrl.submitRegistrationForm);

// Upload stamped form after submission
router.post('/:id/stamped-form', registrationCtrl.uploadStampedForm);

// Get user's forms
router.get('/my-forms', registrationCtrl.getRegistrationForms);

// Get current registration state (draft OR active)
router.get('/my-current', registrationCtrl.getRegistrationFormCurrent);

// Claim form (link offline form to user account)
router.post('/claim-form', registrationCtrl.claimRegistrationForm);

// Get single form by ID
router.get('/:id', registrationCtrl.getRegistrationFormById);

// Delete draft form
router.delete('/:id', registrationCtrl.deleteRegistrationForm);

// ============ ADMIN ROUTES ============
router.use(authorize('admin'));

// List all forms (admin)
router.get('/', registrationCtrl.getRegistrationForms);

// Admin: Actions
router.patch('/:id/request-missing', registrationAdminCtrl.requestMissingDocuments);
router.patch('/:id/approve', registrationAdminCtrl.approveRegistrationForm);
router.patch('/:id/reject', registrationAdminCtrl.rejectRegistrationForm);

// Admin: Confirm single/batch forms
router.patch('/:id/confirm', registrationAdminCtrl.adminConfirmSingleForm);
router.post('/admin/confirm', registrationAdminCtrl.adminConfirmForms);

// Admin: Dashboard stats
router.get('/admin/stats', registrationAdminCtrl.getAdminStats);

// Admin: Check overdue forms
router.post('/admin/check-overdue', registrationAdminCtrl.adminCheckOverdueForms);

// Admin: Review documents
router.post('/:id/review-documents', registrationAdminCtrl.adminReviewDocuments);

// Admin: Offline form management
router.post('/:id/mark-received', registrationAdminCtrl.markOfflineFormReceived);
router.patch('/:id/offline-data', registrationAdminCtrl.adminSaveOfflineFormData);
router.post('/:id/offline-documents', registrationAdminCtrl.adminUploadOfflineDocument);
router.patch('/:id/processing', registrationAdminCtrl.moveToProcessing);

// Admin: User assignment
router.patch('/:id/assign-user', registrationAdminCtrl.assignUserToRegistrationForm);

export default router;
