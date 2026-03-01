// routes/charts.js
import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// IMEI -> stationCode mapping
const imeiToStationCode = {
  WSEP161721195358: "58",
  WSEP161741066504: "04",
  WSEP161741066505: "05",
  WSEP161741066502: "02",
  WSEP161741066503: "03",
};

// Helper: get ISO date string
function isoDate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Helper: get ISO week number
function getWeekNumber(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
}

// ✅ Route accepts IMEI, converts to stationCode internally
router.get("/:imei", async (req, res) => {
  try {
    const { imei } = req.params;
    const stationCode = imeiToStationCode[imei];

    if (!stationCode) {
      return res.status(400).json({ error: "Invalid IMEI" });
    }

    const rentalsRef = db.collection("rentals");
    const snapshot = await rentalsRef
      .where("stationCode", "==", stationCode)
      .where("status", "in", ["rented", "returned"])
      .get();

    const dailyRev = {},
      weeklyRev = {},
      monthlyRev = {};
    const dailyCust = {},
      weeklyCust = {},
      monthlyCust = {};

    snapshot.forEach((doc) => {
      const r = doc.data();
      if (!r.timestamp) return;

      const ts = r.timestamp.toDate();
      const day = isoDate(ts);
      const week = `Week ${getWeekNumber(ts)}`;
      const month = ts.toLocaleString("default", {
        year: "numeric",
        month: "long",
      });

      const amt = parseFloat(r.amount) || 0;
      const phone = r.phoneNumber || "";

      // Revenue
      dailyRev[day] = (dailyRev[day] || 0) + amt;
      weeklyRev[week] = (weeklyRev[week] || 0) + amt;
      monthlyRev[month] = (monthlyRev[month] || 0) + amt;

      // Unique customers
      dailyCust[day] = dailyCust[day] || new Set();
      weeklyCust[week] = weeklyCust[week] || new Set();
      monthlyCust[month] = monthlyCust[month] || new Set();

      dailyCust[day].add(phone);
      weeklyCust[week].add(phone);
      monthlyCust[month].add(phone);
    });

    const build = (rev, cust) => ({
      labels: Object.keys(rev).sort(),
      data: Object.keys(rev)
        .sort()
        .map((k) => rev[k]),
      customers: Object.keys(cust)
        .sort()
        .map((k) => cust[k].size),
    });

    res.json({
      dailyRevenue: {
        labels: build(dailyRev, dailyCust).labels,
        data: build(dailyRev, dailyCust).data,
      },
      weeklyRevenue: {
        labels: build(weeklyRev, weeklyCust).labels,
        data: build(weeklyRev, weeklyCust).data,
      },
      monthlyRevenue: {
        labels: build(monthlyRev, monthlyCust).labels,
        data: build(monthlyRev, monthlyCust).data,
      },
      dailyCustomers: {
        labels: build(dailyRev, dailyCust).labels,
        data: build(dailyRev, dailyCust).customers,
      },
      weeklyCustomers: {
        labels: build(weeklyRev, weeklyCust).labels,
        data: build(weeklyRev, weeklyCust).customers,
      },
      monthlyCustomers: {
        labels: build(monthlyRev, monthlyCust).labels,
        data: build(monthlyRev, monthlyCust).customers,
      },
    });
  } catch (err) {
    console.error("Charts error:", err);
    res.status(500).json({ error: "Failed to generate charts" });
  }
});

export default router;
