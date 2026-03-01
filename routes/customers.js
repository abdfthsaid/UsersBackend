// routes/customerRoutes.js
import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// 🧠 Helpers to compute Timestamp bounds for today/month (UTC+3 Somalia time)
const SOMALIA_OFFSET_HOURS = 3; // UTC+3

function getDayBounds(date = new Date()) {
  // Get current time in UTC+3 (Somalia)
  const nowUtc = date.getTime();
  const somaliaTime = new Date(nowUtc + SOMALIA_OFFSET_HOURS * 60 * 60 * 1000);

  // Get start of day in Somalia time (midnight UTC+3)
  const somaliaYear = somaliaTime.getUTCFullYear();
  const somaliaMonth = somaliaTime.getUTCMonth();
  const somaliaDay = somaliaTime.getUTCDate();

  // Convert midnight Somalia back to UTC
  const startUtc = new Date(
    Date.UTC(somaliaYear, somaliaMonth, somaliaDay) -
      SOMALIA_OFFSET_HOURS * 60 * 60 * 1000
  );
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return {
    startTs: Timestamp.fromDate(startUtc),
    endTs: Timestamp.fromDate(endUtc),
    dateStr: `${somaliaYear}-${String(somaliaMonth + 1).padStart(
      2,
      "0"
    )}-${String(somaliaDay).padStart(2, "0")}`,
  };
}

function getMonthBounds(date = new Date()) {
  // Get current time in UTC+3 (Somalia)
  const nowUtc = date.getTime();
  const somaliaTime = new Date(nowUtc + SOMALIA_OFFSET_HOURS * 60 * 60 * 1000);

  const somaliaYear = somaliaTime.getUTCFullYear();
  const somaliaMonth = somaliaTime.getUTCMonth();

  // Start of month in Somalia time, converted to UTC
  const startUtc = new Date(
    Date.UTC(somaliaYear, somaliaMonth, 1) -
      SOMALIA_OFFSET_HOURS * 60 * 60 * 1000
  );
  const endUtc = new Date(
    Date.UTC(somaliaYear, somaliaMonth + 1, 1) -
      SOMALIA_OFFSET_HOURS * 60 * 60 * 1000
  );

  return {
    startTs: Timestamp.fromDate(startUtc),
    endTs: Timestamp.fromDate(endUtc),
    monthKey: `${somaliaYear}-${String(somaliaMonth + 1).padStart(2, "0")}`,
  };
}

/* ------------------------------------------------------------------ */
/* 📌 Station-level counts                                             */
/* ------------------------------------------------------------------ */

// ✅ Daily UNIQUE customer count for one station (by IMEI)
router.get("/daily-by-imei/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, dateStr } = getDayBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("status", "in", ["rented", "returned"])
      .get();

    const uniquePhones = new Set();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.phoneNumber) {
        uniquePhones.add(data.phoneNumber);
      }
    });

    res.status(200).json({
      imei,
      date: dateStr,
      totalCustomersToday: uniquePhones.size,
      totalRentalsToday: snapshot.size,
    });
  } catch (err) {
    console.error("❌ Error calculating daily rentals:", err);
    res.status(500).json({ error: "Failed to fetch daily customer count" });
  }
});

// ✅ Monthly UNIQUE customer count for one station (by IMEI)
router.get("/monthly-by-imei/:imei", async (req, res) => {
  const { imei } = req.params;
  const { startTs, monthKey } = getMonthBounds();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("imei", "==", imei)
      .where("timestamp", ">=", startTs)
      .where("status", "in", ["rented", "returned"])
      .get();

    const phones = new Set();
    snapshot.forEach((doc) => {
      const num = doc.data().phoneNumber;
      if (num) phones.add(num);
    });

    res.json({
      imei,
      month: monthKey,
      totalCustomersThisMonth: phones.size,
      totalRentalsThisMonth: snapshot.size,
    });
  } catch (err) {
    console.error("❌ Monthly customer error:", err);
    res.status(500).json({ error: "Failed to fetch monthly customer count" });
  }
});

/* ------------------------------------------------------------------ */
/* 📌 Global totals (all stations)                                    */
/* ------------------------------------------------------------------ */

// ✅ Daily total across ALL stations (unique by transactionId)
router.get("/daily-total", async (req, res) => {
  const { startTs, dateStr } = getDayBounds();
  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("status", "in", ["rented", "returned"])
      .get();

    const uniqueCustomers = new Set();
    const stationSet = new Set();
    const uniqueTransactions = new Set();

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Skip duplicates by transactionId
      const txId = data.transactionId || doc.id;
      if (uniqueTransactions.has(txId)) return;
      uniqueTransactions.add(txId);

      if (data.phoneNumber) uniqueCustomers.add(data.phoneNumber);
      if (data.imei) stationSet.add(data.imei);
    });

    res.json({
      date: dateStr,
      totalCustomersToday: uniqueCustomers.size,
      totalRentalsToday: uniqueTransactions.size,
      stations: stationSet.size,
    });
  } catch (err) {
    console.error("❌ Daily-total error:", err);
    res.status(500).json({ error: "Failed to fetch daily totals" });
  }
});

// ✅ Monthly total across ALL stations (unique by transactionId)
router.get("/monthly-total", async (req, res) => {
  const { startTs, monthKey } = getMonthBounds();
  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", startTs)
      .where("status", "in", ["rented", "returned"])
      .get();

    const uniqueCustomers = new Set();
    const stationSet = new Set();
    const uniqueTransactions = new Set();

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Skip duplicates by transactionId
      const txId = data.transactionId || doc.id;
      if (uniqueTransactions.has(txId)) return;
      uniqueTransactions.add(txId);

      if (data.phoneNumber) uniqueCustomers.add(data.phoneNumber);
      if (data.imei) stationSet.add(data.imei);
    });

    res.json({
      month: monthKey,
      totalCustomersThisMonth: uniqueCustomers.size,
      totalRentalsThisMonth: uniqueTransactions.size,
      stations: stationSet.size,
    });
  } catch (err) {
    console.error("❌ Monthly-total error:", err);
    res.status(500).json({ error: "Failed to fetch monthly totals" });
  }
});

export default router;
