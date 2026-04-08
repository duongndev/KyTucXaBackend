import express from 'express';
import * as registrationCtrl from '../controllers/registration.controller.js';
import { protect, authorize } from '../middlewares/auth.middlewares.js';

const router = express.Router();

// Student routes (protected)
router.use(protect);

// Create new registration form
router.post('/', registrationCtrl.createRegistrationForm);

// Step-based workflow
router.patch('/:id/step1', registrationCtrl.saveStep1);
router.patch('/:id/step2', registrationCtrl.saveStep2);

// Document upload
router.post('/:id/documents', registrationCtrl.uploadDocument);

// Submit form
router.post('/:id/submit', registrationCtrl.submitRegistrationForm);

// Upload stamped form after submission
router.post('/:id/stamped-form', registrationCtrl.uploadStampedForm);

// Get status & progress
router.get('/:id/status', registrationCtrl.getRegistrationStatus);

// Get user's forms
router.get('/my-forms', registrationCtrl.getRegistrationForms);

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

export default router;
