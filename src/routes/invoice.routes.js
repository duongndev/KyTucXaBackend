import express from "express";
import * as invoiceCtrl from "../controllers/contract/invoice.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.use(protect);

router.get("/my-invoices", invoiceCtrl.getMyInvoices);
router.get("/my-pending", invoiceCtrl.getMyPendingInvoices);

router.get("/overdue", authorize("admin"), invoiceCtrl.getOverdueInvoices);
router.get("/stats", authorize("admin"), invoiceCtrl.getInvoiceStats);

router.get("/", authorize("admin"), invoiceCtrl.getAllInvoices);
router.get("/:id", invoiceCtrl.getInvoiceById);
router.post("/", authorize("admin"), invoiceCtrl.createInvoice);
router.post("/generate-monthly", authorize("admin"), invoiceCtrl.generateMonthlyInvoice);

router.patch("/:id/discount", authorize("admin"), invoiceCtrl.applyDiscount);
router.patch("/:id/cancel", authorize("admin"), invoiceCtrl.cancelInvoice);
router.patch("/:id/mark-overdue", authorize("admin"), invoiceCtrl.markAsOverdue);

export default router;
