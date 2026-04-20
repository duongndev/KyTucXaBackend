import express from "express";
import * as buildingCtrl from "../controllers/building.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";
import {
  validate,
  validateQuery,
  createBuildingSchema,
  updateBuildingSchema,
  buildingQuerySchema
} from "../validators/building.validator.js";

const router = express.Router();

router.use(protect);

router.get("/", validateQuery(buildingQuerySchema), buildingCtrl.getAllBuildings);
router.get("/stats/:id", buildingCtrl.getBuildingStats);
router.get("/sync-stats/:id", authorize("admin"), buildingCtrl.syncBuildingStats);
router.get("/:id", buildingCtrl.getBuildingById);

router.post("/", authorize("admin"), validate(createBuildingSchema), buildingCtrl.createBuilding);
router.put("/:id", authorize("admin"), validate(updateBuildingSchema), buildingCtrl.updateBuilding);
router.delete("/:id", authorize("admin"), buildingCtrl.deleteBuilding);

export default router;
