const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const router = express.Router();
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const sign = (u) =>
  jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

router.post(
  "/register",
  wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password || password.length < 6) {
      return res
        .status(400)
        .json({ error: "email and password (min 6 chars) are required" });
    }
    const hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await pool.query(
        "INSERT INTO users(email, password_hash) VALUES($1, $2) RETURNING id, email, role",
        [email, hash],
      );
      res.status(201).json({ token: sign(rows[0]), user: rows[0] });
    } catch (e) {
      if (e.code === "23505")
        return res.status(409).json({ error: "Email already registered" });
      throw e;
    }
  }),
);

router.post(
  "/login",
  wrap(async (req, res) => {
    const { email, password } = req.body || {};
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password || "", u.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json({
      token: sign(u),
      user: { id: u.id, email: u.email, role: u.role },
    });
  }),
);

module.exports = { router, requireAuth };
