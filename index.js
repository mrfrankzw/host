import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

// Use JSON and serve static files from /public
app.use(express.json());
app.use(express.static('public'));

// Helper: Generate a random app name (e.g. subzero-ab12cd34)
function generateRandomAppName() {
  return 'subzero-' + Math.random().toString(36).substring(2, 10);
}

// POST /deploy: Creates a new Heroku app, sets config vars, and triggers a build
app.post('/deploy', async (req, res) => {
  const { sessionId, prefix } = req.body;
  const herokuApiKey = process.env.HEROKU_API_KEY;
  if (!herokuApiKey) {
    return res.status(500).json({ error: "Heroku API key not configured" });
  }

  const appName = generateRandomAppName();
  try {
    // Create a new Heroku app
    const createResponse = await fetch(`https://api.heroku.com/apps`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({ name: appName })
    });
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Error creating app: ${errorText}`);
    }
    await createResponse.json(); // not used further

    // Update config vars (SESSION_ID and PREFIX)
    await fetch(`https://api.heroku.com/apps/${appName}/config-vars`, {
      method: 'PATCH',
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({ SESSION_ID: sessionId, PREFIX: prefix })
    });

    // Trigger a build using the GitHub tarball URL
    const buildResponse = await fetch(`https://api.heroku.com/apps/${appName}/builds`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({
        source_blob: {
          url: "https://github.com/mrfrank-ofc/SUBZERO-BOT/archive/main.tar.gz"
        }
      })
    });
    if (!buildResponse.ok) {
      const errorText = await buildResponse.text();
      throw new Error(`Error triggering build: ${errorText}`);
    }
    const buildData = await buildResponse.json();

    res.json({ message: "Deployment Started", build_id: buildData.id, appName });
  } catch (error) {
    console.error("Deployment error:", error);
    res.status(500).json({ error: error.toString() });
  }
});

// GET /logs: Returns simulated live logs (for a production setup, integrate actual Heroku log streaming)
app.get('/logs', async (req, res) => {
  const simulatedLog = `[${new Date().toISOString()}] Log: App is running smoothly...`;
  res.json({ logs: simulatedLog });
});

// POST /stop: Scales the worker to 0 (stops the app)
app.post('/stop', async (req, res) => {
  const { appName } = req.body;
  const herokuApiKey = process.env.HEROKU_API_KEY;
  if (!appName) return res.status(400).json({ error: "Missing appName" });
  try {
    const response = await fetch(`https://api.heroku.com/apps/${appName}/formation/worker`, {
      method: 'PATCH',
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({ quantity: 0 })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Stop error:", error);
    res.status(500).json({ error: error.toString() });
  }
});

// POST /start: Scales the worker to 1 (starts the app)
app.post('/start', async (req, res) => {
  const { appName } = req.body;
  const herokuApiKey = process.env.HEROKU_API_KEY;
  if (!appName) return res.status(400).json({ error: "Missing appName" });
  try {
    const response = await fetch(`https://api.heroku.com/apps/${appName}/formation/worker`, {
      method: 'PATCH',
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.heroku+json; version=3",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({ quantity: 1 })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Start error:", error);
    res.status(500).json({ error: error.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
