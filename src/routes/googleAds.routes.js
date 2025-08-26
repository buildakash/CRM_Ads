import { Router } from "express";
import {
  startGoogleAdsConnect,
  googleAdsCallback,
  selectCustomer,
  summaryLast7Days
} from "../controllers/googleAds.controller.js";

const router = Router();

router.get("/connect", startGoogleAdsConnect);     // → /ads/google/connect
router.get("/callback", googleAdsCallback);        // → /ads/google/callback
router.post("/select-customer", selectCustomer);   // → /ads/google/select-customer
router.get("/summary", summaryLast7Days);          // → /ads/google/summary

export default router;
