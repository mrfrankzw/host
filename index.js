const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// POST /deploy: Update config vars then trigger a new build using the GitHub tarball URL.
app.post('/deploy', async (req, res) => {
  const { herokuApiKey, herokuAppName, sessionId, prefix } = req.body;
  if (!herokuApiKey || !herokuAppName) {
    return res.status(400).json({ error: 'Missing herokuApiKey or herokuAppName' });
  }
  try {
    // 1. Update the config vars (SESSION_ID & PREFIX)
    const configResponse = await fetch(`https://api.heroku.com/apps/${herokuAppName}/config-vars`, {
      method: 'PATCH',
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({
        "SESSION_ID": sessionId,
        "PREFIX": prefix
      })
    });
    const configData = await configResponse.json();

    // 2. Trigger a new build using the GitHub tarball URL.
    const buildResponse = await fetch(`https://api.heroku.com/apps/${herokuAppName}/builds`, {
      method: 'POST',
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({
        "source_blob": {
          "url": "https://api.github.com/repos/mrfrank-ofc/SUBZERO-BOT/tarball/main",
          "version": "main"
        }
      })
    });
    const buildData = await buildResponse.json();

    return res.json({ config: configData, build: buildData });
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({ error: error.toString() });
  }
});

// GET /repo-status: Get the latest commit details from GitHub.
app.get('/repo-status', async (req, res) => {
  try {
    const response = await fetch('https://api.github.com/repos/mrfrank-ofc/SUBZERO-BOT/commits/main');
    const data = await response.json();
    const commitInfo = {
      sha: data.sha,
      message: data.commit.message,
      date: data.commit.author.date
    };
    res.json(commitInfo);
  } catch (error) {
    console.error('Repo status error:', error);
    res.status(500).json({ error: error.toString() });
  }
});

// GET /bot-status: Check if the deployed bot (app) is responding.
app.get('/bot-status', async (req, res) => {
  const { herokuAppName } = req.query;
  if (!herokuAppName) {
    return res.status(400).json({ error: 'Missing herokuAppName parameter' });
  }
  try {
    const botUrl = `https://${herokuAppName}.herokuapp.com`;
    const response = await fetch(botUrl, { timeout: 5000 });
    if (response.ok) {
      res.json({ status: 'running' });
    } else {
      res.json({ status: 'stopped', code: response.status });
    }
  } catch (error) {
    console.error('Bot status error:', error);
    res.json({ status: 'stopped', error: error.toString() });
  }
});

// POST /stop: Scale down the worker dyno to 0 to “stop” the bot.
app.post('/stop', async (req, res) => {
  const { herokuApiKey, herokuAppName } = req.body;
  if (!herokuApiKey || !herokuAppName) {
    return res.status(400).json({ error: 'Missing herokuApiKey or herokuAppName' });
  }
  try {
    const response = await fetch(`https://api.heroku.com/apps/${herokuAppName}/formation/worker`, {
      method: 'PATCH',
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({ quantity: 0 })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Stop error:', error);
    res.status(500).json({ error: error.toString() });
  }
});

// POST /start: Scale up the worker dyno to 1 to “start” the bot.
app.post('/start', async (req, res) => {
  const { herokuApiKey, herokuAppName } = req.body;
  if (!herokuApiKey || !herokuAppName) {
    return res.status(400).json({ error: 'Missing herokuApiKey or herokuAppName' });
  }
  try {
    const response = await fetch(`https://api.heroku.com/apps/${herokuAppName}/formation/worker`, {
      method: 'PATCH',
      headers: {
        "Accept": "application/vnd.heroku+json; version=3",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${herokuApiKey}`
      },
      body: JSON.stringify({ quantity: 1 })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Start error:', error);
    res.status(500).json({ error: error.toString() });
  }
});

// GET /logs: (Optional) Return deployment logs if available.
app.get('/logs', async (req, res) => {
  // In a full implementation, you might fetch logs from the build’s output_stream_url.
  // Here we simply simulate the response.
  res.json({ logs: "Not Available" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
