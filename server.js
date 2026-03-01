import dotenv from "dotenv";
dotenv.config();

import express from "express";
import axios from "axios";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import { Timestamp } from "firebase-admin/firestore";
import rateLimit from "express-rate-limit";

import db from "./config/firebase.js";

// 🚫 Check if phone number is blacklisted
async function isPhoneBlacklisted(phoneNumber) {
  try {
    const snapshot = await db
      .collection("blacklist")
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking blacklist:", error);
    return false;
  }
}

// 🌍 ENV
const {
  PORT = 3000,
  HEYCHARGE_API_KEY,
  HEYCHARGE_DOMAIN,
  WAAFI_API_KEY,
  WAAFI_MERCHANT_UID,
  WAAFI_API_USER_ID,
  WAAFI_URL,
  STATION_CASTELLO_TALEEX,
  STATION_CASTELLO_BOONDHERE,
  STATION_JAVA_TALEEX,
  STATION_JAVA_AIRPORT,
  STATION_DILEK_SOMALIA,
} = process.env;

// 🛠️ App setup
const app = express();

// 🚫 Rate limiting for payment endpoint
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: { error: "Too many payment requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 🚫 Rate limiting for blacklist check
const blacklistCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  message: { error: "Too many requests, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(bodyParser.json());

// 📊 Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[PAYMENT] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - IP: ${req.ip}`,
    );
  });
  next();
});

// 🏷️ Station code to IMEI map
const stationImeisByCode = {
  58: STATION_CASTELLO_TALEEX,
  "02": STATION_CASTELLO_BOONDHERE,
  "03": STATION_JAVA_TALEEX,
  "04": STATION_JAVA_AIRPORT,
  "05": STATION_DILEK_SOMALIA,
};

// 🔋 Get available battery
async function getAvailableBattery(imei) {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
  const res = await axios.get(url, {
    auth: { username: HEYCHARGE_API_KEY, password: "" },
  });

  const batteries = res.data.batteries.filter(
    (b) =>
      b.lock_status === "1" &&
      parseInt(b.battery_capacity) >= 60 &&
      b.battery_abnormal === "0" &&
      b.cable_abnormal === "0",
  );

  batteries.sort(
    (a, b) => parseInt(b.battery_capacity) - parseInt(a.battery_capacity),
  );

  return batteries[0];
}

// 🔓 Unlock battery
async function releaseBattery(imei, battery_id, slot_id) {
  const url = `${HEYCHARGE_DOMAIN}/v1/station/${imei}`;
  const res = await axios.post(url, null, {
    auth: { username: HEYCHARGE_API_KEY, password: "" },
    params: { battery_id, slot_id },
  });
  return res.data;
}

// 🌐 Home route
app.get("/", (req, res) => {
  res.send("🚀 Payment Server is running!");
});

// 🕐 Server timezone info
app.get("/api/timezone", (req, res) => {
  const now = new Date();
  res.json({
    serverTime: now.toISOString(),
    serverTimeLocal: now.toString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: now.getTimezoneOffset(),
    offsetHours: -now.getTimezoneOffset() / 60,
  });
});

// 🔍 Check if phone number is blacklisted
app.get(
  "/api/blacklist/check/:phoneNumber",
  blacklistCheckLimiter,
  async (req, res) => {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    try {
      const blacklisted = await isPhoneBlacklisted(phoneNumber);
      res.json({ blacklisted });
    } catch (err) {
      console.error("❌ Blacklist check error:", err);
      res.status(500).json({ error: "Failed to check blacklist status" });
    }
  },
);

// 💳 Payment + rental logging + unlock battery
app.post("/api/pay/:stationCode", paymentLimiter, async (req, res) => {
  const { stationCode } = req.params;
  const { phoneNumber, amount } = req.body;

  if (!phoneNumber || !amount) {
    return res.status(400).json({ error: "Missing phoneNumber or amount" });
  }

  // 🚫 Check if user is blacklisted
  try {
    const blacklisted = await isPhoneBlacklisted(phoneNumber);
    if (blacklisted) {
      return res.status(403).json({
        error: "You are blocked from renting. Please contact support.",
      });
    }
  } catch (err) {
    console.error("❌ Blacklist check failed:", err);
  }

  const imei = stationImeisByCode[stationCode];
  if (!imei) {
    return res.status(404).json({ error: "Invalid station code" });
  }

  try {
    const battery = await getAvailableBattery(imei);
    if (!battery) {
      return res.status(400).json({ error: "No available battery ≥ 60%" });
    }

    const { battery_id, slot_id } = battery;

    // Step 1: WAAFI payment request
    const waafiPayload = {
      schemaVersion: "1.0",
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
      channelName: "WEB",
      serviceName: "API_PURCHASE",
      serviceParams: {
        merchantUid: WAAFI_MERCHANT_UID,
        apiUserId: WAAFI_API_USER_ID,
        apiKey: WAAFI_API_KEY,
        paymentMethod: "MWALLET_ACCOUNT",
        payerInfo: { accountNo: phoneNumber },
        transactionInfo: {
          referenceId: "ref-" + Date.now(),
          invoiceId: "inv-" + Date.now(),
          amount: parseFloat(amount).toFixed(2),
          currency: "USD",
          description: "Powerbank rental",
        },
      },
    };

    const waafiRes = await axios.post(WAAFI_URL, waafiPayload, {
      headers: { "Content-Type": "application/json" },
    });

    const approved =
      waafiRes.data.responseCode === "2001" ||
      waafiRes.data.responseCode == 2001;

    if (!approved) {
      return res.status(400).json({
        error: "Payment not approved ❌",
        waafiResponse: waafiRes.data,
      });
    }

    // 🔒 DUPLICATE PREVENTION
    const { transactionId, issuerTransactionId, referenceId } =
      waafiRes.data.params || {};

    if (transactionId) {
      const existingTx = await db
        .collection("rentals")
        .where("transactionId", "==", transactionId)
        .limit(1)
        .get();

      if (!existingTx.empty) {
        console.log(`⚠️ Duplicate transaction blocked: ${transactionId}`);
        return res.json({
          success: true,
          message: "Payment already processed",
          transactionId,
        });
      }
    }

    // 📝 Step 2: Log rental to Firestore
    const rentalRef = await db.collection("rentals").add({
      imei,
      stationCode,
      battery_id,
      slot_id,
      phoneNumber,
      amount: parseFloat(amount) || 0,
      status: "rented",
      transactionId: transactionId || null,
      issuerTransactionId: issuerTransactionId || null,
      referenceId: referenceId || null,
      timestamp: Timestamp.now(),
    });

    // 🔓 Step 3: Unlock battery
    let unlockRes;
    try {
      unlockRes = await releaseBattery(imei, battery_id, slot_id);
    } catch (unlockError) {
      await rentalRef.delete();
      return res.status(500).json({
        error: "Battery unlock failed ❌",
        details: unlockError.response?.data || unlockError.message,
      });
    }

    res.json({
      success: true,
      battery_id,
      slot_id,
      unlock: unlockRes,
      waafiMessage: waafiRes.data.responseMsg || "Payment successful",
      waafiResponse: waafiRes.data,
    });
  } catch (err) {
    console.error("❌ Payment error:", err);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ❌ Express error handling
app.use((err, req, res, next) => {
  console.error("❌ Express error:", err.stack);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// 🚨 Global error handlers
process.on("uncaughtException", (err) => {
  console.error("❌ UNCAUGHT EXCEPTION:", err);
  console.error(err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ UNHANDLED REJECTION at:", promise);
  console.error("Reason:", reason);
});

// 🚀 Server start
const server = app.listen(PORT, () => {
  console.log(`✅ Payment Server running on port ${PORT}`);
});

// 🛑 Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Closing payment server gracefully...`);
  server.close(() => {
    console.log("✅ Payment server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("⚠️ Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
