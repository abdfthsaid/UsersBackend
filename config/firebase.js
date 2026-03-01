import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

if (!process.env.FIREBASE_CREDENTIALS_B64) {
  console.error("❌ Missing FIREBASE_CREDENTIALS_B64");
  process.exit(1);
}

let decoded;
try {
  decoded = Buffer.from(
    process.env.FIREBASE_CREDENTIALS_B64,
    "base64"
  ).toString("utf8");
} catch (err) {
  console.error("❌ Failed to decode base64:", err.message);
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(decoded);
} catch (err) {
  console.error("❌ Failed to parse decoded JSON:", err.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
export default db;
