import express from "express";
import authRoutes from "./routes/auth.routes.js";
import googleAdsRoutes from "./routes/googleAds.routes.js"; 

const app = express();
app.use(express.json());

app.get("/", (_req, res) => res.send("Auth ready. Go to /auth/google/start"));

app.use("/auth", authRoutes);
app.use("/ads/google", googleAdsRoutes); // <-- this line must exist

export default app;
