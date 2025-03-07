require("dotenv").config(); // Load environment variables from .env
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const axios = require("axios"); // For making API requests to Heroku

// Initialize Firebase Admin SDK using environment variables
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Fix newline issue
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Middleware to authenticate requests
const authenticate = async (req, res, next) => {
  const idToken = req.headers.authorization;
  if (!idToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: "Unauthorized" });
  }
};

// Claim Tokens Endpoint
app.post("/claim", authenticate, async (req, res) => {
  const userId = req.user.uid;
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: "User not found" });
  }

  const userData = userDoc.data();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  if (now - userData.lastClaim < oneDay) {
    return res.status(400).json({ error: "You can claim tokens only once every 24 hours" });
  }

  const newTokens = userData.tokens + 10;
  await userRef.update({
    tokens: newTokens,
    lastClaim: now,
  });

  res.json({ message: "Tokens claimed successfully", tokens: newTokens });
});

// Recharge Tokens Endpoint
app.post("/recharge", authenticate, async (req, res) => {
  const { key } = req.body;
  const userId = req.user.uid;
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: "User not found" });
  }

  if (key !== process.env.RECHARGE_KEY) { // Use environment variable for recharge key
    return res.status(400).json({ error: "Invalid recharge key" });
  }

  const userData = userDoc.data();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  if (now - userData.lastRecharge < oneDay) {
    return res.status(400).json({ error: "You can recharge only once every 24 hours" });
  }

  const newTokens = userData.tokens + 20;
  await userRef.update({
    tokens: newTokens,
    lastRecharge: now,
  });

  res.json({ message: "Tokens recharged successfully", tokens: newTokens });
});

// Deploy Bot Endpoint
app.post("/deploy", authenticate, async (req, res) => {
  const { envVars } = req.body;
  const userId = req.user.uid;
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: "User not found" });
  }

  const userData = userDoc.data();
  if (userData.tokens < 1) {
    return res.status(400).json({ error: "Insufficient tokens to deploy" });
  }

  // Deploy to Heroku
  try {
    const herokuResponse = await axios.post(
      `https://api.heroku.com/apps`,
      {
        name: `subzero-bot-${Date.now()}`,
        region: "us",
        stack: "container",
      },
      {
        headers: {
          Accept: "application/vnd.heroku+json; version=3",
          Authorization: `Bearer ${process.env.HEROKU_API_KEY}`, // Use environment variable for Heroku API key
          "Content-Type": "application/json",
        },
      }
    );

    const appName = herokuResponse.data.name;
    const buildId = herokuResponse.data.id;

    // Deduct 1 token
    await userRef.update({
      tokens: userData.tokens - 1,
    });

    // Save bot details to Firestore
    await db.collection("users").doc(userId).collection("bots").add({
      appName,
      envVars,
      timestamp: new Date(),
    });

    res.json({ message: "Deployment initiated", appName, buildId });
  } catch (error) {
    console.error("Heroku deployment error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to deploy bot" });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
