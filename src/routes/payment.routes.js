import express from "express";
import * as paymentCtrl from "../controllers/contract/payment.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.use(protect);

router.get("/my-payments", paymentCtrl.getMyPayments);

router.get("/pending-verifications", authorize("admin"), paymentCtrl.getPendingVerifications);
router.get("/stats", authorize("admin"), paymentCtrl.getPaymentStats);

router.get("/", authorize("admin"), paymentCtrl.getAllPayments);
router.get("/:id", paymentCtrl.getPaymentById);
router.post("/", paymentCtrl.createPayment);

router.patch("/:id/verify", authorize("admin"), paymentCtrl.verifyPayment);
router.patch("/:id/reject", authorize("admin"), paymentCtrl.rejectPayment);
router.patch("/:id/process-online", paymentCtrl.processOnlinePayment);
router.patch("/:id/refund", authorize("admin"), paymentCtrl.refundPayment);
router.patch("/:id/retry", paymentCtrl.retryPayment);
router.patch("/:id/receipt", paymentCtrl.generateReceipt);

export default router;
