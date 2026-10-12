const bcrypt = require("bcryptjs");
const pool = require("./db");

module.exports = async function seed() {
  const client = await pool.connect();
  try {
    // Khóa để khi chạy nhiều replica cùng lúc thì chỉ một replica seed
    await client.query("SELECT pg_advisory_lock(424242)");

    const users = [
      { email: "admin@example.com", password: "admin123", role: "admin" },
      { email: "user1@example.com", password: "user123", role: "member" },
      { email: "user2@example.com", password: "user123", role: "member" },
    ];
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        "INSERT INTO users(email, password_hash, role) VALUES($1, $2, $3) ON CONFLICT (email) DO NOTHING",
        [u.email, hash, u.role],
      );
    }

    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS n FROM boards",
    );
    if (rows[0].n === 0) {
      const admin = await client.query(
        "SELECT id FROM users WHERE email = $1",
        ["admin@example.com"],
      );
      const board = await client.query(
        "INSERT INTO boards(name, owner_id) VALUES($1, $2) RETURNING id",
        ["Demo Board", admin.rows[0].id],
      );
      const names = ["To Do", "In Progress", "Done"];
      const colIds = [];
      for (let i = 0; i < names.length; i++) {
        const c = await client.query(
          "INSERT INTO columns(board_id, name, position) VALUES($1, $2, $3) RETURNING id",
          [board.rows[0].id, names[i], i],
        );
        colIds.push(c.rows[0].id);
      }
      const tasks = [
        ["Write Dockerfile", 2],
        ["Set up Docker Compose", 1],
        ["Add Nginx load balancer", 0],
        ["Write report", 0],
      ];
      for (const [title, col] of tasks) {
        await client.query(
          "INSERT INTO tasks(column_id, title) VALUES($1, $2)",
          [colIds[col], title],
        );
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(424242)");
    client.release();
  }
};
