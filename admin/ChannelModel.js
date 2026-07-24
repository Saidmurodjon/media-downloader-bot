const { pool } = require("../db");

module.exports = class ChannelModel {
  static async list() {
    const { rows } = await pool.query("SELECT * FROM channels ORDER BY id");
    return rows;
  }

  static async get(username) {
    const { rows } = await pool.query("SELECT * FROM channels WHERE username = $1", [username]);
    return rows[0] || null;
  }

  // Returns null if the channel is already tracked (no-op).
  static async add(username) {
    const { rows } = await pool.query(
      `INSERT INTO channels (username) VALUES ($1)
       ON CONFLICT (username) DO NOTHING
       RETURNING *`,
      [username]
    );
    return rows[0] || null;
  }

  static async remove(username) {
    await pool.query("DELETE FROM channels WHERE username = $1", [username]);
  }

  static async setTarget(username, targetCount) {
    await pool.query(
      "UPDATE channels SET target_count = $2, target_notified = FALSE WHERE username = $1",
      [username, targetCount]
    );
  }

  static async clearTarget(username) {
    await pool.query(
      "UPDATE channels SET target_count = NULL, target_notified = FALSE WHERE username = $1",
      [username]
    );
  }

  static async markTargetNotified(username) {
    await pool.query("UPDATE channels SET target_notified = TRUE WHERE username = $1", [username]);
  }

  static async recordEvent(username, chatId, event) {
    await pool.query(
      "INSERT INTO channel_events (channel_username, chat_id, event) VALUES ($1, $2, $3)",
      [username, chatId, event]
    );
  }

  // Join/leave counts are only ever observed from the moment the bot became
  // a channel admin and we started listening — there's no way to backfill
  // members who joined before that via the Bot API.
  static async eventStats(username) {
    const { rows } = await pool.query(
      `SELECT event, COUNT(*)::int AS count FROM channel_events WHERE channel_username = $1 GROUP BY event`,
      [username]
    );
    const joined = rows.find((r) => r.event === "joined")?.count || 0;
    const left = rows.find((r) => r.event === "left")?.count || 0;
    return { joined, left, net: joined - left };
  }
};
