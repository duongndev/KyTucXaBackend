import express from "express";
import * as semesterCtrl from "../controllers/contract/semesterInvoice.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.use(protect);

// Student routes
router.get("/my-invoices", semesterCtrl.getMySemesterInvoices);

// Admin routes
router.get("/stats", authorize("admin"), semesterCtrl.getBillingStats);
router.get("/pending", authorize("admin"), semesterCtrl.getPendingSemesterInvoices);
router.get("/", authorize("admin"), semesterCtrl.getAllSemesterInvoices);
router.get("/:id", semesterCtrl.getSemesterInvoiceById);
router.post("/generate", authorize("admin"), semesterCtrl.createRoomRentInvoices);
router.post("/generate-6month", authorize("admin"), semesterCtrl.create6MonthInvoices);
router.post("/generate-monthly", authorize("admin"), semesterCtrl.generateMonthlyBilling);
router.patch("/:id/pay", semesterCtrl.paySemesterInvoice);
router.patch("/:id/discount", authorize("admin"), semesterCtrl.applyDiscount);
router.patch("/:id/cancel", authorize("admin"), semesterCtrl.cancelSemesterInvoice);

export default router;
