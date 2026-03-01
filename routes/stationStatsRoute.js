// 📡 routes/stationStatsRoute.js
import express from "express";
import updateStationStats from "../utils/updateStationStats.js";
import db from "../config/firebase.js";

const router = express.Router();

// GET all station stats
router.get("/", async (req, res) => {
  try {
    const snapshot = await db.collection("station_stats").get();
    const stations = snapshot.docs.map((doc) => doc.data());
    res.json(stations);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch station stats", details: err.message });
  }
});

// UPDATE all station stats (by API call)
router.post("/update", async (req, res) => {
  try {
    await updateStationStats();
    res.json({ message: "Station stats updated successfully ✅" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update station stats", details: err.message });
  }
});

export default router;
