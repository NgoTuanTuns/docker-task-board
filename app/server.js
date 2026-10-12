const express = require("express");
const os = require("os");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", db: "up", host: os.hostname() });
  } catch (err) {
    res.status(503).json({ status: "error", db: "down" });
  }
});

app.listen(PORT, () => console.log(`App listening on port ${PORT}`));
