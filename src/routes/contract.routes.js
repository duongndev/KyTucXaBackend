import express from "express";
import * as contractCtrl from "../controllers/contract/contract.controller.js";
import { protect, authorize } from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.use(protect);

router.get("/my-contract", contractCtrl.getMyContract);

router.get("/stats", authorize("admin"), contractCtrl.getContractStats);

router.get("/", authorize("admin"), contractCtrl.getAllContracts);
router.get("/:id", contractCtrl.getContractById);
router.post("/", authorize("admin"), contractCtrl.createContract);
router.put("/:id", authorize("admin"), contractCtrl.updateContract);
router.delete("/:id", authorize("admin"), contractCtrl.deleteContract);

router.patch("/:id/sign-student", contractCtrl.signContractByStudent);
router.patch("/:id/sign-admin", authorize("admin"), contractCtrl.signContractByAdmin);
router.patch("/:id/terminate", authorize("admin"), contractCtrl.terminateContract);

export default router;
