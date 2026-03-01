import express from "express";
import db from "../config/firebase.js";
import { Timestamp } from "firebase-admin/firestore";

const router = express.Router();

// ✅✅
// 🔐 POST: Save rental log & update daily + monthly customer stats

router.post("/log", async (req, res) => {
  console.log("📥 /log route hit:", req.body);

  const { imei, battery_id, slot_id, amount, phoneNumber } = req.body;

  try {
    // 🔍 Look up station using IMEI as the document ID
    const stationDoc = await db.collection("stations").doc(imei).get();

    if (!stationDoc.exists) {
      return res.status(404).json({ error: "Station not found ❌" });
    }

    // ✅ Save rental with IMEI
    await db.collection("rentals").add({
      stationCode: imei, // ✅ still store as stationCode field
      imei,
      battery_id,
      slot_id,
      amount: parseFloat(amount) || 0,
      phoneNumber,
      status: "rented",
      timestamp: Timestamp.now(),
    });

    const now = new Date();

    // 📆 DAILY CUSTOMER COUNTER
    const todayKey = now.toISOString().split("T")[0];
    const dailyId = `${imei}_${todayKey}`;
    const dailyRef = db.collection("daily_customer_stats").doc(dailyId);

    await db.runTransaction(async (t) => {
      const dailyDoc = await t.get(dailyRef);
      if (dailyDoc.exists) {
        t.update(dailyRef, { count: (dailyDoc.data().count || 0) + 1 });
      } else {
        t.set(dailyRef, {
          stationCode: imei,
          date: todayKey,
          count: 1,
        });
      }
    });

    // 📅 MONTHLY CUSTOMER COUNTER
    const monthKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    const monthlyId = `${imei}_${monthKey}`;
    const monthlyRef = db.collection("monthly_customer_stats").doc(monthlyId);

    await db.runTransaction(async (t) => {
      const monthlyDoc = await t.get(monthlyRef);
      if (monthlyDoc.exists) {
        t.update(monthlyRef, { count: (monthlyDoc.data().count || 0) + 1 });
      } else {
        t.set(monthlyRef, {
          stationCode: imei,
          month: monthKey,
          count: 1,
        });
      }
    });

    res.status(201).json({ message: "Rental logged successfully ✅" });
  } catch (error) {
    console.error("Log Error:", error);
    res.status(500).json({ error: "Rental log failed ❌" });
  }
});

// 🔍 DEBUG: Check today's rentals for duplicates/issues
router.get("/debug/today", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .get();

    const rentals = [];
    const phoneCount = {};
    const batteryCount = {};
    let duplicatePhones = 0;
    let duplicateBatteries = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      rentals.push({
        id: doc.id,
        phone: data.phoneNumber,
        battery: data.battery_id,
        slot: data.slot_id,
        amount: data.amount,
        status: data.status,
        station: data.stationCode,
      });

      // Count phone occurrences
      if (data.phoneNumber) {
        phoneCount[data.phoneNumber] = (phoneCount[data.phoneNumber] || 0) + 1;
      }
      // Count battery occurrences
      if (data.battery_id) {
        batteryCount[data.battery_id] =
          (batteryCount[data.battery_id] || 0) + 1;
      }
    });

    // Find duplicates
    const duplicatePhonesList = Object.entries(phoneCount)
      .filter(([_, count]) => count > 1)
      .map(([phone, count]) => ({ phone, count }));

    const duplicateBatteriesList = Object.entries(batteryCount)
      .filter(([_, count]) => count > 1)
      .map(([battery, count]) => ({ battery, count }));

    res.json({
      date: today.toISOString().split("T")[0],
      totalRentals: snapshot.size,
      uniquePhones: Object.keys(phoneCount).length,
      uniqueBatteries: Object.keys(batteryCount).length,
      duplicatePhones: duplicatePhonesList,
      duplicateBatteries: duplicateBatteriesList,
      rentals: rentals.slice(0, 20), // First 20
    });
  } catch (error) {
    console.error("❌ Debug error:", error);
    res.status(500).json({ error: "Debug failed ❌" });
  }
});

// 🧹 CLEANUP: Delete duplicate rentals (keeps first, deletes rest)
router.delete("/cleanup/duplicates", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const snapshot = await db
      .collection("rentals")
      .where("timestamp", ">=", Timestamp.fromDate(today))
      .orderBy("timestamp", "asc")
      .get();

    const seenBatteries = new Set();
    const toDelete = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const key = `${data.battery_id}_${data.stationCode}`;

      if (seenBatteries.has(key)) {
        toDelete.push(doc.id);
      } else {
        seenBatteries.add(key);
      }
    });

    // Delete duplicates
    for (const id of toDelete) {
      await db.collection("rentals").doc(id).delete();
    }

    res.json({
      message: `Deleted ${toDelete.length} duplicate rentals`,
      deletedIds: toDelete,
    });
  } catch (error) {
    console.error("❌ Cleanup error:", error);
    res.status(500).json({ error: "Cleanup failed ❌" });
  }
});

export default router;
