import express from "express";
import * as utilityCtrl from "../controllers/utility/utility.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.use(protect);

router.get("/meter-readings", authorize("admin"), utilityCtrl.getMeterReadings);
router.get("/meter-readings/by-month", authorize("admin"), utilityCtrl.getReadingsByMonth);
router.get("/meter-readings/room/:roomId", utilityCtrl.getRoomReadingHistory);
router.get("/meter-readings/:id", utilityCtrl.getMeterReadingById);
router.post("/meter-readings", authorize("admin"), utilityCtrl.createMeterReading);
router.put("/meter-readings/:id", authorize("admin"), utilityCtrl.updateMeterReading);
router.patch("/meter-readings/:id/verify", authorize("admin"), utilityCtrl.verifyMeterReading);
router.delete("/meter-readings/:id", authorize("admin"), utilityCtrl.deleteMeterReading);

router.get("/rates", utilityCtrl.getUtilityRates);
router.get("/rates/active", utilityCtrl.getActiveRates);
router.post("/rates", authorize("admin"), utilityCtrl.createUtilityRate);
router.put("/rates/:id", authorize("admin"), utilityCtrl.updateUtilityRate);
router.post("/rates/init-default", authorize("admin"), utilityCtrl.initDefaultRates);

router.post("/calculate", authorize("admin"), utilityCtrl.calculateUtilityCost);

export default router;
