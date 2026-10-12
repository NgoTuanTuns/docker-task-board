const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const pool = require("./db");
const { router: authRouter } = require("./auth");
const apiRoutes = require("./routes");
const seed = require("./seed");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", db: "up", host: os.hostname() });
  } catch (err) {
    res.status(503).json({ status: "error", db: "down" });
  }
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

async function start() {
  await seed();
  server.listen(PORT, () =>
    console.log(`App ${os.hostname()} listening on port ${PORT}`),
  );
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
