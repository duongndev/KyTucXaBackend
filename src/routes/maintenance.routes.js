import express from "express";
import { protect, authorize } from "../middlewares/auth.middlewares.js";
import {
  // Student APIs
  createMaintenanceRequest,
  getMyMaintenanceRequests,
  getMyRequestDetail,
  updateMyRequest,
  cancelMyRequest,
  rateMaintenanceRequest,
  // Admin APIs
  getAllMaintenanceRequests,
  getRequestDetailAdmin,
  updateRequestStatus,
  assignRequest,
  completeRequest,
  scheduleRequest,
  getMyAssignments,
  getMaintenanceStatistics,
  getPendingUnviewed
} from "../controllers/maintenance/maintenance.controller.js";

const router = express.Router();

// ==================== STUDENT ROUTES ====================

// Create new maintenance request
router.post("/", protect, createMaintenanceRequest);

// Get my maintenance requests
router.get("/my-requests", protect, getMyMaintenanceRequests);

// Get my request detail
router.get("/:id", protect, getMyRequestDetail);

// Update my request (only pending/reviewing)
router.put("/:id", protect, updateMyRequest);

// Cancel my request
router.delete("/:id", protect, cancelMyRequest);

// Rate completed request
router.post("/:id/rate", protect, rateMaintenanceRequest);

// ==================== ADMIN ROUTES ====================

// Get all requests (with filters)
router.get("/admin/all", protect, authorize("admin"), getAllMaintenanceRequests);

// Get pending unviewed count
router.get("/admin/pending-unviewed", protect, authorize("admin"), getPendingUnviewed);

// Get statistics
router.get("/admin/statistics", protect, authorize("admin"), getMaintenanceStatistics);

// Get my assignments (for technician/staff)
router.get("/admin/my-assignments", protect, getMyAssignments);

// Get request detail (admin)
router.get("/admin/:id", protect, authorize("admin"), getRequestDetailAdmin);

// Update status
router.put("/admin/:id/status", protect, authorize("admin"), updateRequestStatus);

// Assign to technician
router.put("/admin/:id/assign", protect, authorize("admin"), assignRequest);

// Schedule repair date
router.put("/admin/:id/schedule", protect, authorize("admin"), scheduleRequest);

// Complete request
router.put("/admin/:id/complete", protect, authorize("admin"), completeRequest);

export default router;
