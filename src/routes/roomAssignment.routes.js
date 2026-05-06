import express from "express";
import * as assignmentCtrl from "../controllers/roomAssignment/roomAssignment.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";
import {
  validate,
  validateQuery,
  assignStudentSchema,
  transferStudentSchema,
  checkOutSchema,
  assignmentQuerySchema,
  autoAssignSchema,
  autoAssignMultipleSchema,
  findBestRoomSchema,
  groupRoomSchema,
  assignGroupSchema
} from "../validators/building.validator.js";

const router = express.Router();

router.use(protect);

// Standard assignment routes
router.get("/", authorize("admin"), validateQuery(assignmentQuerySchema), assignmentCtrl.getAllAssignments);
router.get("/my-assignment", assignmentCtrl.getStudentCurrentAssignment);
router.get("/student/:studentId/history", authorize("admin"), assignmentCtrl.getAssignmentHistory);
router.get("/room/:roomId/history", authorize("admin"), assignmentCtrl.getRoomOccupancyHistory);
router.get("/suggest/:studentId", assignmentCtrl.suggestRooms);
router.get("/report/availability", authorize("admin"), assignmentCtrl.getRoomAvailabilityReport);
router.get("/:id", assignmentCtrl.getAssignmentById);

router.post("/assign", authorize("admin"), validate(assignStudentSchema), assignmentCtrl.assignStudentToRoom);
router.post("/transfer", authorize("admin"), validate(transferStudentSchema), assignmentCtrl.transferStudent);
router.post("/checkout", authorize("admin"), validate(checkOutSchema), assignmentCtrl.checkOutStudent);

// Auto assignment routes
router.post("/auto/find-best", authorize("admin"), validate(findBestRoomSchema), assignmentCtrl.findBestRoom);
router.post("/auto/assign", authorize("admin"), validate(autoAssignSchema), assignmentCtrl.autoAssignStudent);
router.post("/auto/assign-multiple", authorize("admin"), validate(autoAssignMultipleSchema), assignmentCtrl.autoAssignMultiple);
router.post("/auto/group/find-room", authorize("admin"), validate(groupRoomSchema), assignmentCtrl.findRoomForGroup);
router.post("/auto/group/assign", authorize("admin"), validate(assignGroupSchema), assignmentCtrl.assignGroupToRoom);

export default router;
