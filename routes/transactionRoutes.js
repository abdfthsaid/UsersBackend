import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

router.get("/latest", async (req, res) => {
  try {
    // Get date 2 days ago
    const now = Timestamp.now();
    const twoDaysAgo = Timestamp.fromDate(
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    );

    // Step 1: Filter only recent "rented" transactions
    const rentalsSnapshot = await db
      .collection("rentals")
      .where("status", "==", "rented")
      .where("timestamp", ">=", twoDaysAgo) // only recent
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const rentals = rentalsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (rentals.length === 0) {
      return res.status(200).json([]); // no rentals found
    }

    // Step 2: Get IMEIs from the rental data
    const imeis = [...new Set(rentals.map((r) => r.imei))];

    // Step 3: Fetch stations for these IMEIs
    const stationSnapshot = await db
      .collection("stations")
      .where("imei", "in", imeis)
      .get();

    const stationMap = {};
    stationSnapshot.forEach((doc) => {
      const data = doc.data();
      stationMap[data.imei] = data.name || null;
    });

    // Step 4: Enrich rentals
    const enrichedRentals = rentals.map((r) => ({
      ...r,
      stationName: stationMap[r.imei] || null,
    }));

    res.json(enrichedRentals);
  } catch (error) {
    console.error("❌ Error fetching latest rentals with station name:", error);
    res.status(500).json({ error: "Failed to fetch enriched rentals ❌" });
  }
});

export default router;
