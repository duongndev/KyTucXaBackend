import express from "express";
import * as billingCtrl from "../controllers/contract/billingSplit.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.use(protect);

// Billing split configuration (admin only)
router.get("/room/:roomId", billingCtrl.getBillingSplitByRoom);
router.post("/", authorize("admin"), billingCtrl.createBillingSplit);
router.patch("/room/:roomId/config", authorize("admin"), billingCtrl.updateSplitConfig);
router.post("/room/:roomId/add-student", authorize("admin"), billingCtrl.addStudentToSplit);
router.patch("/room/:roomId/remove-student/:studentId", authorize("admin"), billingCtrl.removeStudentFromSplit);
router.patch("/room/:roomId/primary-payer", authorize("admin"), billingCtrl.setPrimaryPayer);
router.post("/room/:roomId/preview", authorize("admin"), billingCtrl.calculateSplitPreview);

// Student bills
router.get("/my-bills", billingCtrl.getMyBills);
router.get("/student/:studentId", billingCtrl.getStudentBills);
router.get("/student-bill/:id", billingCtrl.getStudentBillById);
router.post("/student-bill/:id/pay", billingCtrl.payStudentBill);

// Invoice splitting
router.post("/split-invoice", authorize("admin"), billingCtrl.splitExistingInvoice);
router.get("/room/:roomId/summary", authorize("admin"), billingCtrl.getRoomBillSummary);

export default router;
