import express from "express";
import * as serviceCtrl from "../controllers/service/service.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.use(protect);

router.get("/my-services", serviceCtrl.getMyServices);

router.get("/active", serviceCtrl.getActiveServices);
router.get("/", authorize("admin"), serviceCtrl.getAllServices);
router.get("/:id", serviceCtrl.getServiceById);
router.post("/", authorize("admin"), serviceCtrl.createService);
router.put("/:id", authorize("admin"), serviceCtrl.updateService);
router.delete("/:id", authorize("admin"), serviceCtrl.deleteService);

router.post("/init-default", authorize("admin"), serviceCtrl.initDefaultServices);
router.post("/calculate", serviceCtrl.calculateServiceCost);

router.post("/room-subscriptions", authorize("admin"), serviceCtrl.createRoomService);
router.get("/room-subscriptions/:roomId", serviceCtrl.getRoomServices);
router.post("/room-subscriptions/:roomId/subscribe", serviceCtrl.subscribeService);
router.patch("/room-subscriptions/:roomId/unsubscribe/:serviceCode", serviceCtrl.unsubscribeService);

// Laundry service routes
router.get("/laundry/types", serviceCtrl.getLaundryServices);
router.post("/laundry/calculate", serviceCtrl.calculateLaundryCost);

export default router;
