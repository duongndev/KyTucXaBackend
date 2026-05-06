import express from "express";
const router = express.Router();
import * as auditLogCtrl from "../controllers/auditLog/auditLog.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";

// Protected routes (admin only)
router.get("/", protect, authorize("admin"), auditLogCtrl.getAllAuditLogs);
router.get("/:id", protect, authorize("admin"), auditLogCtrl.getAuditLogById);
router.get("/user/:userId", protect, authorize("admin"), auditLogCtrl.getAuditLogsByUser);
// router.get("/action/:action", protect, authorize("admin"), auditLogCtrl.getAuditLogsByAction);
// router.get("/resource/:resource", protect, authorize("admin"), auditLogCtrl.getAuditLogsByResource);
// router.get("/suspicious/:timeRange", protect, authorize("admin"), auditLogCtrl.getSuspiciousActivities);
// router.get("/severity/:severity", protect, authorize("admin"), auditLogCtrl.getAuditLogsBySeverity);
// router.get("/date-range", protect, authorize("admin"), auditLogCtrl.getAuditLogsByDateRange);
// router.get("/ip/:ipAddress", protect, authorize("admin"), auditLogCtrl.getAuditLogsByIp);

export default router;
