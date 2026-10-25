const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const pool = require("./db");
const { router: authRouter } = require("./auth");
const apiRoutes = require("./routes");
const seed = require("./seed");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // This project deliberately uses WebSocket-only clients, avoiding the
  // multi-request sticky-session requirement of HTTP long-polling.
  transports: ["websocket"],
});
const PORT = Number(process.env.PORT || 3000);
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";

const redisPubClient = createClient({ url: REDIS_URL });
const redisSubClient = redisPubClient.duplicate();
redisPubClient.on("error", (err) => console.error("Redis publisher error:", err.message));
redisSubClient.on("error", (err) => console.error("Redis subscriber error:", err.message));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", async (req, res) => {
  let db = "up";
  let redis = "up";
  try {
    await pool.query("SELECT 1");
  } catch {
    db = "down";
  }
  try {
    await redisPubClient.ping();
  } catch {
    redis = "down";
  }

  const healthy = db === "up" && redis === "up";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "error",
    db,
    redis,
    host: os.hostname(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api", apiRoutes(io));

app.use((err, req, res, next) => {
  if (err.code === "22P02")
    return res.status(400).json({ error: "Invalid id" });
  if (err.code === "23503")
    return res.status(404).json({ error: "Referenced record not found" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Socket.IO: xác thực bằng JWT, mỗi board là một "phòng"
io.use((socket, next) => {
  try {
    socket.user = jwt.verify(
      socket.handshake.auth?.token,
      process.env.JWT_SECRET,
    );
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.on("board:join", (boardId) => socket.join(`board:${boardId}`));
  socket.on("board:leave", (boardId) => socket.leave(`board:${boardId}`));
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down ${os.hostname()}`);
  io.close(async () => {
    await Promise.allSettled([redisPubClient.quit(), redisSubClient.quit(), pool.end()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

async function start() {
  // Compose waits for Redis health, but connecting here also fails fast if
  // the adapter cannot be initialized for any reason.
  await Promise.all([redisPubClient.connect(), redisSubClient.connect()]);
  io.adapter(createAdapter(redisPubClient, redisSubClient));
  await seed();
  server.listen(PORT, "0.0.0.0", () =>
    console.log(`App ${os.hostname()} listening on port ${PORT}`),
  );
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

start().catch(async (err) => {
  console.error("Application startup failed:", err);
  await Promise.allSettled([redisPubClient.quit(), redisSubClient.quit(), pool.end()]);
  process.exit(1);
});
