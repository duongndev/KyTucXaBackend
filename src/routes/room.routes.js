import express from "express";
import * as roomCtrl from "../controllers/building/room.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";
import {
  validate,
  validateQuery,
  createRoomSchema,
  updateRoomSchema,
  bulkCreateRoomsSchema,
  autoGenerateRoomsSchema,
  updateRoomStatusSchema,
  roomQuerySchema
} from "../validators/building.validator.js";

const router = express.Router();

router.use(protect);

router.get("/", validateQuery(roomQuerySchema), roomCtrl.getAllRooms);
router.get("/available", roomCtrl.getAvailableRooms);
router.get("/by-code/:roomCode", roomCtrl.getRoomByCode);
router.get("/building/:buildingId", roomCtrl.getRoomsByBuilding);
router.get("/:id", roomCtrl.getRoomById);

router.post("/", authorize("admin"), roomCtrl.createRoom);
router.post("/bulk", authorize("admin"), validate(bulkCreateRoomsSchema), roomCtrl.bulkCreateRooms);
router.post("/auto-generate", authorize("admin"), validate(autoGenerateRoomsSchema), roomCtrl.autoGenerateRooms);
router.put("/:id", authorize("admin"), validate(updateRoomSchema), roomCtrl.updateRoom);
router.patch("/:id/status", authorize("admin"), validate(updateRoomStatusSchema), roomCtrl.updateRoomStatus);
router.delete("/:id", authorize("admin"), roomCtrl.deleteRoom);

export default router;
