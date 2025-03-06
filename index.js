import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static("public"));

// Helper function to generate a random app name.
function generateRandomAppName() {
  // Prefix with "subzero-" then 8 random alphanumeric characters.
  return "subzero-" + Math.random().toString(36).substring(2, 10);
}

// POST /deploy: Create a new Heroku app with a random name, update config vars, then trigger a build.
app.post("/deploy", async (req, res) => {
  const { herokuApiKey, sessionId, prefix } = req.body;
  if (!herokuApiKey) {
    return res.status(400).json({ error: "Missing herokuApiKey" });
  }

  // Generate a random app name.
  const appName = generateRandomAppName();

  try {
    // 1. Create a new Heroku app.
    const createResponse = await fetch(`https://api.heroku.com/apps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`,
      },
      body: JSON.stringify({ name: appName }),
    });
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Error creating app: ${errorText}`);
    }
    const appData = await createResponse.json();

    // 2. Update config vars (SESSION_ID and PREFIX).
    const configResponse = await fetch(`https://api.heroku.com/apps/${appName}/config-vars`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`,
      },
      body: JSON.stringify({
        SESSION_ID: sessionId,
        PREFIX: prefix
      }),
    });
    await configResponse.json();

    // 3. Trigger a new build using the GitHub tarball URL.
    const buildResponse = await fetch(`https://api.heroku.com/apps/${appName}/builds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`,
      },
      body: JSON.stringify({
        source_blob: {
          url: "https://github.com/mrfrank-ofc/SUBZERO-BOT/archive/main.tar.gz"
        },
      }),
    });
    if (!buildResponse.ok) {
      const errorText = await buildResponse.text();
      throw new Error(`Error triggering build: ${errorText}`);
    }
    const buildData = await buildResponse.json();

    return res.json({ message: "Deployment Started", build_id: buildData.id, appName });
  } catch (error) {
    console.error("Deployment error:", error);
    res.status(500).json({ error: error.toString() });
  }
});

// GET /repo-status: Fetch latest commit details from GitHub.
app.get("/repo-status", async (req, res) => {
  try {
    const response = await fetch("https://api.github.com/repos/mrfrank-ofc/SUBZERO-BOT/commits/main");
    const data = await response.json();
    const commitInfo = {
      sha: data.sha,
      message: data.commit.message,
      date: data.commit.author.date
    };
    res.json(commitInfo);
  } catch (error) {
    console.error("Repo status error:", error);
    res.status(500).json({ error: error.toString() });
  }
});

// GET /bot-status: Check if the deployed bot is responding.
app.get("/bot-status", async (req, res) => {
  const { appName } = req.query;
  if (!appName) {
    return res.status(400).json({ error: "Missing appName parameter" });
  }
  try {
    const botUrl = `https://${appName}.herokuapp.com`;
    const response = await fetch(botUrl, { timeout: 5000 });
    if (response.ok) {
      res.json({ status: "running" });
    } else {
      res.json({ status: "stopped", code: response.status });
    }
  } catch (error) {
    console.error("Bot status error:", error);
    res.json({ status: "stopped", error: error.toString() });
  }
});

// POST /stop: Scale the worker dyno to 0 to “stop” the bot.
app.post("/stop", async (req, res) => {
  const { herokuApiKey, appName } = req.body;
  if (!herokuApiKey || !appName) {
    return res.status(400).json({ error: "Missing herokuApiKey or appName" });
  }
  try {
    const response = await fetch(`https://api.heroku.com/apps/${appName}/formation/worker`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`,
      },
      body: JSON.stringify({ quantity: 0 }),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Stop error:", error);
    res.status(500).json({ error: error.toString() });
  }
});

// POST /start: Scale the worker dyno to 1 to “start” the bot.
app.post("/start", async (req, res) => {
  const { herokuApiKey, appName } = req.body;
  if (!herokuApiKey || !appName) {
    return res.status(400).json({ error: "Missing herokuApiKey or appName" });
  }
  try {
    const response = await fetch(`https://api.heroku.com/apps/${appName}/formation/worker`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`,
      },
      body: JSON.stringify({ quantity: 1 }),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Start error:", error);
    res.status(500).json({ error: error.toString() });
  }
});

// GET /logs: (Optional) Simulated logs endpoint.
app.get("/logs", async (req, res) => {
  res.json({ logs: "Not Available" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
