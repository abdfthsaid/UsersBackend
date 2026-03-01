import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// 🕐 Somalia timezone offset (UTC+3)
const SOMALIA_OFFSET_HOURS = 3;

// 🧠 Get day bounds in Somalia time (UTC+3)
function getDayBoundsUTC3() {
  const now = new Date();
  const somaliaTime = new Date(
    now.getTime() + SOMALIA_OFFSET_HOURS * 60 * 60 * 1000
  );

  const somaliaYear = somaliaTime.getUTCFullYear();
  const somaliaMonth = somaliaTime.getUTCMonth();
  const somaliaDay = somaliaTime.getUTCDate();

  const startUtc = new Date(
    Date.UTC(somaliaYear, somaliaMonth, somaliaDay) -
      SOMALIA_OFFSET_HOURS * 60 * 60 * 1000
  );
  const dateStr = `${somaliaYear}-${String(somaliaMonth + 1).padStart(
    2,
    "0"
  )}-${String(somaliaDay).padStart(2, "0")}`;

  return { startUtc, dateStr };
}

// 🧠 Get month bounds in Somalia time (UTC+3)
function getMonthBoundsUTC3() {
  const now = new Date();
  const somaliaTime = new Date(
    now.getTime() + SOMALIA_OFFSET_HOURS * 60 * 60 * 1000
  );

  const somaliaYear = somaliaTime.getUTCFullYear();
  const somaliaMonth = somaliaTime.getUTCMonth();

  const startUtc = new Date(
    Date.UTC(somaliaYear, somaliaMonth, 1) -
      SOMALIA_OFFSET_HOURS * 60 * 60 * 1000
  );
  const monthKey = `${somaliaYear}-${String(somaliaMonth + 1).padStart(
    2,
    "0"
  )}`;

  return { startUtc, monthKey };
}

// ✅ IMEI to stationCode mapping
const imeiToStationCode = {
  WSEP161721195358: "58",
  WSEP161741066504: "04",
  WSEP161741066505: "05",
  WSEP161741066502: "02",
  WSEP161741066503: "03",
};

// ✅ Helper: calculate unique rentals by transactionId (no double count)
const calculateUniqueRevenue = (snapshot) => {
  let total = 0;
  let uniqueTransactions = new Set();
  let missingAmountCount = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    // Use transactionId for uniqueness, fallback to doc.id
    const txId = data.transactionId || doc.id;

    if (!uniqueTransactions.has(txId)) {
      uniqueTransactions.add(txId);

      // Handle amount as number, string, or missing
      let amount = 0;
      if (data.amount !== undefined && data.amount !== null) {
        amount =
          typeof data.amount === "number"
            ? data.amount
            : parseFloat(data.amount);
      } else {
        missingAmountCount++;
      }

      if (!isNaN(amount)) {
        total += amount;
      }
    }
  });

  if (missingAmountCount > 0) {
    console.log(`⚠️ ${missingAmountCount} rentals missing amount field`);
  }

  return { total, count: uniqueTransactions.size };
};

// ✅ DAILY REVENUE FOR SINGLE STATION (by IMEI) - UTC+3 Somalia
router.get("/daily/:imei", async (req, res) => {
  const imei = req.params.imei;
  const stationCode = imeiToStationCode[imei];

  if (!stationCode) {
    return res.status(400).json({ error: `Unknown IMEI ${imei}` });
  }

  const { startUtc, dateStr } = getDayBoundsUTC3();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(startUtc))
      .where("status", "in", ["rented", "returned"])
      .get();

    const { total, count } = calculateUniqueRevenue(snapshot);

    res.json({
      imei,
      stationCode,
      totalRevenueToday: total,
      totalRentalsToday: count,
      date: dateStr,
    });
  } catch (error) {
    console.error("❌ Error calculating daily revenue:", error);
    res.status(500).json({ error: "Failed to calculate daily revenue ❌" });
  }
});

// ✅ DAILY REVENUE FOR ALL STATIONS - UTC+3 Somalia
router.get("/daily", async (req, res) => {
  const { startUtc, dateStr } = getDayBoundsUTC3();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(startUtc))
      .where("status", "in", ["rented", "returned"])
      .get();

    const { total, count } = calculateUniqueRevenue(snapshot);

    res.json({
      totalRevenueToday: total,
      totalRentalsToday: count,
      date: dateStr,
    });
  } catch (error) {
    console.error("❌ Error calculating total daily revenue:", error);
    res
      .status(500)
      .json({ error: "Failed to calculate total daily revenue ❌" });
  }
});

// ✅ MONTHLY REVENUE FOR SINGLE STATION (by IMEI) - UTC+3 Somalia
router.get("/monthly/:imei", async (req, res) => {
  const imei = req.params.imei;
  const stationCode = imeiToStationCode[imei];

  if (!stationCode) {
    return res.status(400).json({ error: `Unknown IMEI ${imei}` });
  }

  const { startUtc, monthKey } = getMonthBoundsUTC3();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("stationCode", "==", stationCode)
      .where("timestamp", ">=", Timestamp.fromDate(startUtc))
      .where("status", "in", ["rented", "returned"])
      .get();

    const { total, count } = calculateUniqueRevenue(snapshot);

    res.json({
      imei,
      stationCode,
      totalRevenueMonthly: total,
      totalRentalsThisMonth: count,
      month: monthKey,
    });
  } catch (error) {
    console.error("❌ Error calculating monthly revenue:", error);
    res.status(500).json({ error: "Failed to calculate monthly revenue ❌" });
  }
});

// ✅ MONTHLY REVENUE FOR ALL STATIONS - UTC+3 Somalia
router.get("/monthly", async (req, res) => {
  const { startUtc, monthKey } = getMonthBoundsUTC3();

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(startUtc))
      .where("status", "in", ["rented", "returned"])
      .get();

    const { total, count } = calculateUniqueRevenue(snapshot);

    res.json({
      totalRevenueMonthly: total,
      totalRentalsThisMonth: count,
      month: monthKey,
    });
  } catch (error) {
    console.error("❌ Error calculating total monthly revenue:", error);
    res
      .status(500)
      .json({ error: "Failed to calculate total monthly revenue ❌" });
  }
});

// 🔍 DEBUG: Check today's rentals with amount details
router.get("/debug/daily", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .where("status", "in", ["rented", "returned"])
      .get();

    const rentals = [];
    let withAmount = 0;
    let withoutAmount = 0;
    let totalRevenue = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const hasAmount = data.amount !== undefined && data.amount !== null;
      if (hasAmount) {
        withAmount++;
        totalRevenue += parseFloat(data.amount) || 0;
      } else {
        withoutAmount++;
      }
      rentals.push({
        id: doc.id,
        amount: data.amount,
        amountType: typeof data.amount,
        hasAmount,
        status: data.status,
        stationCode: data.stationCode,
        timestamp: data.timestamp,
      });
    });

    res.json({
      date: today.toISOString().split("T")[0],
      totalRentals: snapshot.size,
      withAmount,
      withoutAmount,
      calculatedRevenue: totalRevenue,
      rentals: rentals.slice(0, 10), // Show first 10 for debugging
    });
  } catch (error) {
    console.error("❌ Debug error:", error);
    res.status(500).json({ error: "Debug failed ❌" });
  }
});

export default router;
