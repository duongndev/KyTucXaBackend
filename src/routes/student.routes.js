import express from "express";
import * as studentCtrl from "../controllers/student.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";
import { validateQuery } from "../validators/building.validator.js";
import Joi from "joi";

const router = express.Router();

const studentQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
  university: Joi.string().optional(),
  gender: Joi.string().valid("male", "female").optional(),
  ktxStatus: Joi.string().valid("not_registered", "waiting_room", "checked_in", "checked_out", "banned").optional(),
  search: Joi.string().optional()
});

const pendingRoomQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
  university: Joi.string().optional(),
  gender: Joi.string().valid("male", "female").optional(),
  search: Joi.string().optional()
});

router.use(protect);

router.get("/", authorize("admin"), validateQuery(studentQuerySchema), studentCtrl.getAllStudents);
router.get("/pending-room", authorize("admin"), validateQuery(pendingRoomQuerySchema), studentCtrl.getStudentsPendingRoom);
router.get("/:id", authorize("admin"), studentCtrl.getStudentById);

export default router;
