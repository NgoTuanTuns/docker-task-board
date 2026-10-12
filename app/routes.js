const express = require("express");
const pool = require("./db");
const { requireAuth } = require("./auth");

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = function (io) {
  const router = express.Router();
  router.use(requireAuth);

  const emit = (boardId, event, payload) =>
    io.to(`board:${boardId}`).emit(event, payload);
  const boardIdOfColumn = async (columnId) => {
    const { rows } = await pool.query(
      "SELECT board_id FROM columns WHERE id = $1",
      [columnId],
    );
    return rows[0]?.board_id;
  };

  // ---- Boards ----
  router.get(
    "/boards",
    wrap(async (req, res) => {
      const { rows } = await pool.query(
        "SELECT id, name, owner_id, created_at FROM boards ORDER BY id",
      );
      res.json(rows);
    }),
  );

  router.post(
    "/boards",
    wrap(async (req, res) => {
      const name = (req.body?.name || "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const b = await client.query(
          "INSERT INTO boards(name, owner_id) VALUES($1, $2) RETURNING *",
          [name, req.user.id],
        );
        const defaults = ["To Do", "In Progress", "Done"];
        for (let i = 0; i < defaults.length; i++) {
          await client.query(
            "INSERT INTO columns(board_id, name, position) VALUES($1, $2, $3)",
            [b.rows[0].id, defaults[i], i],
          );
        }
        await client.query("COMMIT");
        res.status(201).json(b.rows[0]);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }),
  );

  router.get(
    "/boards/:id",
    wrap(async (req, res) => {
      const board = await pool.query("SELECT * FROM boards WHERE id = $1", [
        req.params.id,
      ]);
      if (!board.rows.length)
        return res.status(404).json({ error: "Board not found" });
      const cols = await pool.query(
        "SELECT * FROM columns WHERE board_id = $1 ORDER BY position, id",
        [req.params.id],
      );
      const tasks = await pool.query(
        `SELECT t.* FROM tasks t JOIN columns c ON c.id = t.column_id
       WHERE c.board_id = $1 ORDER BY t.position, t.id`,
        [req.params.id],
      );
      res.json({
        ...board.rows[0],
        columns: cols.rows.map((c) => ({
          ...c,
          tasks: tasks.rows.filter((t) => t.column_id === c.id),
        })),
      });
    }),
  );

  // Phân quyền: chỉ chủ board hoặc admin được xóa board
  router.delete(
    "/boards/:id",
    wrap(async (req, res) => {
      const b = await pool.query("SELECT owner_id FROM boards WHERE id = $1", [
        req.params.id,
      ]);
      if (!b.rows.length)
        return res.status(404).json({ error: "Board not found" });
      if (b.rows[0].owner_id !== req.user.id && req.user.role !== "admin") {
        return res
          .status(403)
          .json({ error: "Only the owner or an admin can delete this board" });
      }
      await pool.query("DELETE FROM boards WHERE id = $1", [req.params.id]);
      res.status(204).end();
    }),
  );

  // ---- Columns ----
  router.post(
    "/columns",
    wrap(async (req, res) => {
      const { board_id, name } = req.body || {};
      if (!board_id || !name)
        return res
          .status(400)
          .json({ error: "board_id and name are required" });
      const { rows } = await pool.query(
        `INSERT INTO columns(board_id, name, position)
       VALUES($1, $2, COALESCE((SELECT MAX(position) + 1 FROM columns WHERE board_id = $1), 0))
       RETURNING *`,
        [board_id, name],
      );
      emit(board_id, "column:created", rows[0]);
      res.status(201).json(rows[0]);
    }),
  );

  router.delete(
    "/columns/:id",
    wrap(async (req, res) => {
      const { rows } = await pool.query(
        "DELETE FROM columns WHERE id = $1 RETURNING id, board_id",
        [req.params.id],
      );
      if (!rows.length)
        return res.status(404).json({ error: "Column not found" });
      emit(rows[0].board_id, "column:deleted", rows[0]);
      res.status(204).end();
    }),
  );

  // ---- Tasks ----
  router.post(
    "/tasks",
    wrap(async (req, res) => {
      const { column_id, title, description } = req.body || {};
      if (!column_id || !title)
        return res
          .status(400)
          .json({ error: "column_id and title are required" });
      const { rows } = await pool.query(
        `INSERT INTO tasks(column_id, title, description, position)
       VALUES($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE column_id = $1), 0))
       RETURNING *`,
        [column_id, title, description || ""],
      );
      const board_id = await boardIdOfColumn(rows[0].column_id);
      emit(board_id, "task:created", { ...rows[0], board_id });
      res.status(201).json(rows[0]);
    }),
  );

  // Chuyển cột = đổi column_id
  router.patch(
    "/tasks/:id",
    wrap(async (req, res) => {
      const { title, description, column_id } = req.body || {};
      const { rows } = await pool.query(
        `UPDATE tasks SET title = COALESCE($1, title),
                        description = COALESCE($2, description),
                        column_id = COALESCE($3, column_id)
       WHERE id = $4 RETURNING *`,
        [title ?? null, description ?? null, column_id ?? null, req.params.id],
      );
      if (!rows.length)
        return res.status(404).json({ error: "Task not found" });
      const board_id = await boardIdOfColumn(rows[0].column_id);
      emit(board_id, "task:updated", { ...rows[0], board_id });
      res.json(rows[0]);
    }),
  );

  router.delete(
    "/tasks/:id",
    wrap(async (req, res) => {
      const { rows } = await pool.query(
        "DELETE FROM tasks WHERE id = $1 RETURNING id, column_id",
        [req.params.id],
      );
      if (!rows.length)
        return res.status(404).json({ error: "Task not found" });
      const board_id = await boardIdOfColumn(rows[0].column_id);
      emit(board_id, "task:deleted", { id: rows[0].id, board_id });
      res.status(204).end();
    }),
  );

  return router;
};
