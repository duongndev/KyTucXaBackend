import express from 'express';
import * as authCtrl from '../controllers/auth.controller.js';
import { protect, logout, userRateLimit } from '../middlewares/auth.middlewares.js';
const router = express.Router();

// Public routes
router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.post('/refresh-token', authCtrl.refreshToken);
router.post('/verify-otp', authCtrl.verifyEmailOTP);
router.post('/resend-otp', authCtrl.resendOTP);

// Protected routes
router.use(protect);
router.get('/me', authCtrl.getCurrentUser);
router.patch('/update-profile', userRateLimit(10, 60 * 1000), authCtrl.updateProfile); // 10 requests per minute
router.post('/logout', logout, authCtrl.logout);

export default router;
