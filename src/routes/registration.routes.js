import express from 'express';
import * as registrationCtrl from '../controllers/registration.controller.js';
import { protect, authorize } from '../middlewares/auth.middlewares.js';
import {
  uploadImageMiddleware,
  handleUploadError
} from '../middlewares/cloudinaryUpload.middleware.js';

const router = express.Router();

// Student routes (protected)
router.use(protect);

// Create new registration form
router.post('/', registrationCtrl.createRegistrationForm);

// Step-based workflow
router.patch('/:id/step1', registrationCtrl.saveStep1);
router.patch('/:id/step2', registrationCtrl.saveStep2);

// Document upload — sensitive (CCCD / thẻ SV): multipart/form-data, field "image"
// Backend tự upload lên Cloudinary authenticated, Frontend KHÔNG trực tiếp upload lên Cloudinary
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

// Get status & progress
router.get('/:id/status', registrationCtrl.getRegistrationStatus);

// Get user's forms
router.get('/my-forms', registrationCtrl.getRegistrationForms);

// Get current draft form (for continuing registration)
router.get('/my-current', registrationCtrl.getRegistrationFormCurrent);

// Claim form (link offline form to user account)
router.post('/claim-form', registrationCtrl.claimRegistrationForm);

// Preview forms
router.get('/preview-residence/:id', registrationCtrl.previewResidenceFormHTML);
router.get('/preview-temporary/:id', registrationCtrl.previewTemporaryFormHTML);

// Get single form by ID
router.get('/:id', registrationCtrl.getRegistrationFormById);

// Delete draft form
router.delete('/:id', registrationCtrl.deleteRegistrationForm);

// Admin routes
router.use(authorize('admin'));

// List all forms (admin)
router.get('/', registrationCtrl.getRegistrationForms);

// Admin actions
router.patch('/:id/request-missing', registrationCtrl.requestMissingDocuments);
router.patch('/:id/approve', registrationCtrl.approveRegistrationForm);
router.patch('/:id/reject', registrationCtrl.rejectRegistrationForm);

// Offline submission - mark as received (new flow: pending_offline -> received_offline)
router.post('/:id/mark-received', registrationCtrl.markOfflineFormReceived);

// Admin: Enter offline form data (Step 1 & 2)
router.patch('/:id/offline-data', registrationCtrl.adminSaveOfflineFormData);

// Admin: Upload scanned documents for offline form
router.post('/:id/offline-documents', registrationCtrl.adminUploadOfflineDocument);

// Admin: Move to processing
router.patch('/:id/processing', registrationCtrl.moveToProcessing);

// Admin: Assign user to form (for linking offline forms to user accounts)
router.patch('/:id/assign-user', registrationCtrl.assignUserToRegistrationForm);

export default router;
