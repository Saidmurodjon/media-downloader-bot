const { pool } = require("../db");

module.exports = class BroadcastModel {
  static async create(adminChatId, content, button) {
    const { rows } = await pool.query(
      `INSERT INTO broadcasts (admin_chat_id, content, button)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [adminChatId, JSON.stringify(content), button ? JSON.stringify(button) : null]
    );
    return rows[0].id;
  }

  static async recordResult(id, sentCount, failedCount) {
    await pool.query(
      "UPDATE broadcasts SET sent_count = $2, failed_count = $3 WHERE id = $1",
      [id, sentCount, failedCount]
    );
  }

  static async getLatest() {
    const { rows } = await pool.query(
      "SELECT id, content, button FROM broadcasts ORDER BY id DESC LIMIT 1"
    );
    return rows[0] || null;
  }

  static async history(limit = 5) {
    const { rows } = await pool.query(
      `SELECT id, content, sent_count, failed_count, created_at
       FROM broadcasts ORDER BY id DESC LIMIT $1`,
      [limit]
    );
    return rows;
  }
};
