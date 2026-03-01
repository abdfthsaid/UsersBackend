import express from "express";
import moment from "moment";
import db from "../config/firebase.js";

const router = express.Router();

router.get("/all", async (req, res) => {
  try {
    const rentalsSnapshot = await db.collection("rentals").get();

    const dailyRevenue = {};
    const weeklyRevenue = {};
    const monthlyRevenue = {};

    const dailyCustomers = {};
    const weeklyCustomers = {};
    const monthlyCustomers = {};

    rentalsSnapshot.forEach((doc) => {
      const data = doc.data();
      const { timestamp, amount, phoneNumber } = data;

      if (!timestamp || !amount || !phoneNumber) return;

      const date = moment(timestamp.toDate());
      const day = date.format("YYYY-MM-DD");
      const week = date.startOf("isoWeek").format("GGGG-[W]WW");
      const month = date.format("YYYY-MM");

      // Revenue
      dailyRevenue[day] = (dailyRevenue[day] || 0) + amount;
      weeklyRevenue[week] = (weeklyRevenue[week] || 0) + amount;
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + amount;

      // Unique Customers
      dailyCustomers[day] = dailyCustomers[day] || new Set();
      dailyCustomers[day].add(phoneNumber);

      weeklyCustomers[week] = weeklyCustomers[week] || new Set();
      weeklyCustomers[week].add(phoneNumber);

      monthlyCustomers[month] = monthlyCustomers[month] || new Set();
      monthlyCustomers[month].add(phoneNumber);
    });

    const formatChart = (obj, isSet = false) => {
      const labels = Object.keys(obj).sort();
      const data = labels.map((label) =>
        isSet ? Array.from(obj[label]).length : obj[label]
      );
      return { labels, data };
    };

    res.json({
      dailyRevenue: formatChart(dailyRevenue),
      weeklyRevenue: formatChart(weeklyRevenue),
      monthlyRevenue: formatChart(monthlyRevenue),

      dailyCustomers: formatChart(dailyCustomers, true),
      weeklyCustomers: formatChart(weeklyCustomers, true),
      monthlyCustomers: formatChart(monthlyCustomers, true),
    });
  } catch (err) {
    console.error("Error in /api/charts/all:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
