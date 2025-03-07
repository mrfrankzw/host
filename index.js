import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HEROKU_API_KEY = process.env.HEROKU_API_KEY;

app.use(express.json());
app.use(express.static("public"));

// Helper: Generate a random Heroku app name.
function generateRandomAppName() {
  return "subzero-" + Math.random().toString(36).substring(2, 10);
}

// POST /deploy: Create a new Heroku app, set env vars, trigger a build.
app.post("/deploy", async (req, res) => {
  if (!HEROKU_API_KEY) {
    return res.status(500).json({ error: "Server missing Heroku API key" });
  }
  const { envVars } = req.body; // Expect an array of { key, value }
  const appName = generateRandomAppName();

  try {
    // 1. Create the Heroku app.
    const createResp = await fetch("https://api.heroku.com/apps", {
      method: "POST",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify({ name: appName })
    });
    if (!createResp.ok) {
      const txt = await createResp.text();
      throw new Error(`Error creating app: ${txt}`);
    }
    await createResp.json();

    // 2. Prepare config vars.
    const configObj = {};
    envVars.forEach(v => { configObj[v.key] = v.value; });

    // 3. Update config vars.
    const configResp = await fetch(`https://api.heroku.com/apps/${appName}/config-vars`, {
      method: "PATCH",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify(configObj)
    });
    if (!configResp.ok) {
      const txt = await configResp.text();
      throw new Error(`Error setting config vars: ${txt}`);
    }

    // 4. Trigger a build using your GitHub tarball URL.
    const buildResp = await fetch(`https://api.heroku.com/apps/${appName}/builds`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify({
        source_blob: {
          url: "https://github.com/mrfrank-ofc/SUBZERO-BOT/archive/main.tar.gz"
        }
      })
    });
    if (!buildResp.ok) {
      const txt = await buildResp.text();
      throw new Error(`Error triggering build: ${txt}`);
    }
    const buildData = await buildResp.json();

    return res.json({
      message: "Deployment initiated",
      build_id: buildData.id,
      appName
    });
  } catch (error) {
    console.error("Deploy Error:", error);
    return res.status(500).json({ error: error.toString() });
  }
});

// GET /logs: Open a log session and return logs.
app.get("/logs", async (req, res) => {
  const { appName } = req.query;
  if (!appName) return res.status(400).json({ error: "Missing appName" });
  try {
    const sessionResp = await fetch(`https://api.heroku.com/apps/${appName}/log-sessions`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify({
        dyno: "worker",
        tail: true,
        lines: 100
      })
    });
    if (!sessionResp.ok) {
      const txt = await sessionResp.text();
      throw new Error(`Error creating log session: ${txt}`);
    }
    const sessionData = await sessionResp.json();
    const logUrl = sessionData.logplex_url;
    if (!logUrl) throw new Error("No log URL returned");

    const logsResp = await fetch(logUrl);
    const logs = await logsResp.text();
    return res.json({ logs });
  } catch (error) {
    console.error("Logs Error:", error);
    return res.status(500).json({ error: error.toString() });
  }
});

// POST /stop: Scale worker to 0.
app.post("/stop", async (req, res) => {
  const { appName } = req.body;
  if (!appName) return res.status(400).json({ error: "Missing appName" });
  try {
    const resp = await fetch(`https://api.heroku.com/apps/${appName}/formation/worker`, {
      method: "PATCH",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify({ quantity: 0 })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Error stopping worker: ${txt}`);
    }
    const data = await resp.json();
    return res.json(data);
  } catch (error) {
    console.error("Stop Error:", error);
    return res.status(500).json({ error: error.toString() });
  }
});

// POST /start: Scale worker to 1.
app.post("/start", async (req, res) => {
  const { appName } = req.body;
  if (!appName) return res.status(400).json({ error: "Missing appName" });
  try {
    const resp = await fetch(`https://api.heroku.com/apps/${appName}/formation/worker`, {
      method: "PATCH",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify({ quantity: 1 })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Error starting worker: ${txt}`);
    }
    const data = await resp.json();
    return res.json(data);
  } catch (error) {
    console.error("Start Error:", error);
    return res.status(500).json({ error: error.toString() });
  }
});

// POST /update: Update environment variables for a given app.
app.post("/update", async (req, res) => {
  const { appName, envVars } = req.body;
  if (!appName || !envVars) return res.status(400).json({ error: "Missing parameters" });
  try {
    const configObj = {};
    envVars.forEach(v => { configObj[v.key] = v.value; });
    const updateResp = await fetch(`https://api.heroku.com/apps/${appName}/config-vars`, {
      method: "PATCH",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      },
      body: JSON.stringify(configObj)
    });
    if (!updateResp.ok) {
      const txt = await updateResp.text();
      throw new Error(`Error updating config vars: ${txt}`);
    }
    const data = await updateResp.json();
    return res.json({ message: "Update successful", data });
  } catch (error) {
    console.error("Update Error:", error);
    return res.status(500).json({ error: error.toString() });
  }
});

// POST /delete: Delete a Heroku app.
app.post("/delete", async (req, res) => {
  const { appName } = req.body;
  if (!appName) return res.status(400).json({ error: "Missing appName" });
  try {
    const resp = await fetch(`https://api.heroku.com/apps/${appName}`, {
      method: "DELETE",
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${HEROKU_API_KEY}`
      }
    });
    if (resp.status === 202 || resp.status === 200) {
      return res.json({ message: "App deleted" });
    } else {
      const txt = await resp.text();
      throw new Error(`Error deleting app: ${txt}`);
    }
  } catch (error) {
    console.error("Delete Error:", error);
    return res.status(500).json({ error: error.toString() });
  }
});

// Serve home.html on root.
app.get("/", (req, res) => {
  res.sendFile("home.html", { root: "public" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
