import express from "express";

import jwt from "jsonwebtoken";

import db from "../config/firebase.js";

import { authenticateToken, requireAdmin } from "../middleware/auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "danab_power_secret_key_2024";

const TOKEN_EXPIRY = "1h"; // 1 hour

const router = express.Router();

// Add a new user with unique username and email and role validation (ADMIN ONLY)

router.post("/add", authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, role, email } = req.body;

  if (!username || !password || !role || !email) {
    return res

      .status(400)

      .json({ error: "username, password, role, and email are required ❌" });
  }

  if (!["admin", "user"].includes(role)) {
    return res

      .status(400)

      .json({ error: "Role must be 'admin' or 'user' only ❌" });
  }

  try {
    // Check unique username

    const usernameSnap = await db

      .collection("system_users")

      .where("username", "==", username)

      .get();

    if (!usernameSnap.empty) {
      return res.status(409).json({ error: "Username already exists ❌" });
    }

    // Check unique email

    const emailSnap = await db

      .collection("system_users")

      .where("email", "==", email)

      .get();

    if (!emailSnap.empty) {
      return res.status(409).json({ error: "Email already exists ❌" });
    }

    const newUserRef = await db.collection("system_users").add({
      username,

      password,

      role,

      email,

      createdAt: new Date(),
    });

    res.status(201).json({ message: "User added ✅", id: newUserRef.id });
  } catch (error) {
    console.error("Add user error:", error);

    res.status(500).json({ error: "Failed to add user ❌" });
  }
});

// Update user by id or username (partial updates allowed) (ADMIN ONLY)

router.put("/update", authenticateToken, requireAdmin, async (req, res) => {
  const { id, username } = req.query;

  const updates = req.body;

  if (!id && !username) {
    return res

      .status(400)

      .json({ error: "Provide 'id' or 'username' to update user ❌" });
  }

  if (updates.role && !["admin", "user"].includes(updates.role)) {
    return res

      .status(400)

      .json({ error: "Role must be 'admin' or 'user' only ❌" });
  }

  try {
    let userDocRef;

    let currentData;

    if (id) {
      userDocRef = db.collection("system_users").doc(id);

      const doc = await userDocRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: "User not found ❌" });
      }

      currentData = doc.data();
    } else {
      const snap = await db

        .collection("system_users")

        .where("username", "==", username)

        .limit(1)

        .get();

      if (snap.empty) {
        return res.status(404).json({ error: "User not found ❌" });
      }

      userDocRef = snap.docs[0].ref;

      currentData = snap.docs[0].data();
    }

    // If updating username, check uniqueness

    if (updates.username && updates.username !== currentData.username) {
      const usernameSnap = await db

        .collection("system_users")

        .where("username", "==", updates.username)

        .get();

      if (!usernameSnap.empty) {
        return res.status(409).json({ error: "Username already exists ❌" });
      }
    }

    // If updating email, check uniqueness

    if (updates.email && updates.email !== currentData.email) {
      const emailSnap = await db

        .collection("system_users")

        .where("email", "==", updates.email)

        .get();

      if (!emailSnap.empty) {
        return res.status(409).json({ error: "Email already exists ❌" });
      }
    }

    await userDocRef.update({
      ...updates,

      updatedAt: new Date(),
    });

    res.json({ message: "User updated successfully ✅" });
  } catch (error) {
    console.error("Update user error:", error);

    res.status(500).json({ error: "Failed to update user ❌" });
  }
});

// Delete user by id or username (ADMIN ONLY)

router.delete("/delete", authenticateToken, requireAdmin, async (req, res) => {
  const { id, username } = req.query;

  if (!id && !username) {
    return res

      .status(400)

      .json({ error: "Provide 'id' or 'username' to delete user ❌" });
  }

  try {
    if (id) {
      const docRef = db.collection("system_users").doc(id);

      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: "User not found ❌" });
      }

      await docRef.delete();
    } else {
      const snap = await db

        .collection("system_users")

        .where("username", "==", username)

        .limit(1)

        .get();

      if (snap.empty) {
        return res.status(404).json({ error: "User not found ❌" });
      }

      await snap.docs[0].ref.delete();
    }

    res.json({ message: "User deleted successfully ✅" });
  } catch (error) {
    console.error("Delete user error:", error);

    res.status(500).json({ error: "Failed to delete user ❌" });
  }
});

// Get all users (ADMIN ONLY)

router.get("/all", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection("system_users").get();

    const users = snapshot.docs.map((doc) => ({
      id: doc.id,

      ...doc.data(),
    }));

    res.json(users);
  } catch (err) {
    console.error("Fetch all users error:", err);

    res.status(500).json({ error: "Failed to fetch users ❌" });
  }
});

// Get one user by id or username (ADMIN ONLY)

router.get("/one", authenticateToken, requireAdmin, async (req, res) => {
  const { id, username } = req.query;

  if (!id && !username) {
    return res

      .status(400)

      .json({ error: "Provide 'id' or 'username' to fetch user ❌" });
  }

  try {
    let doc;

    if (id) {
      doc = await db.collection("system_users").doc(id).get();

      if (!doc.exists) {
        return res.status(404).json({ error: "User not found ❌" });
      }

      return res.json({ id: doc.id, ...doc.data() });
    } else {
      const snap = await db

        .collection("system_users")

        .where("username", "==", username)

        .limit(1)

        .get();

      if (snap.empty) {
        return res.status(404).json({ error: "User not found ❌" });
      }

      const found = snap.docs[0];

      return res.json({ id: found.id, ...found.data() });
    }
  } catch (err) {
    console.error("Fetch one user error:", err);

    res.status(500).json({ error: "Failed to fetch user ❌" });
  }
});

// / Login route

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required ❌" });
  }

  try {
    const userSnap = await db

      .collection("system_users")

      .where("username", "==", username)

      .limit(1)

      .get();

    if (userSnap.empty) {
      return res.status(401).json({ error: "Invalid username or password ❌" });
    }

    const userDoc = userSnap.docs[0];

    const userData = userDoc.data();

    if (userData.password !== password) {
      return res.status(401).json({ error: "Invalid username or password ❌" });
    }

    // Generate JWT token with 4-hour expiry

    const tokenPayload = {
      id: userDoc.id,

      username: userData.username,

      role: userData.role,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRY,
    });

    const expiresAt = Date.now() + 1 * 60 * 60 * 1000; // 1 hour from now

    res.json({
      message: "Login successful ✅",

      token,

      expiresAt,

      user: {
        id: userDoc.id,

        username: userData.username,

        role: userData.role,

        email: userData.email || null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({ error: "Login failed ❌" });
  }
});

// solved

export default router;
