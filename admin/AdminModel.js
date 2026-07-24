const { pool } = require("../db");

module.exports = class AdminModel {
  static async isAdmin(chatId) {
    const { rows } = await pool.query(
      "SELECT 1 FROM users WHERE chat_id = $1 AND is_admin = TRUE",
      [chatId]
    );
    return rows.length > 0;
  }

  // Returns null if the chat_id isn't a known user (hasn't run /start yet).
  static async setAdmin(chatId, isAdmin) {
    const { rowCount } = await pool.query(
      "UPDATE users SET is_admin = $2 WHERE chat_id = $1",
      [chatId, isAdmin]
    );
    return rowCount > 0;
  }

  // Used once at boot to seed the initial admin from ADMIN_ID, whether or
  // not that chat_id has run /start yet.
  static async bootstrapAdmin(chatId) {
    await pool.query(
      `INSERT INTO users (chat_id, is_admin) VALUES ($1, TRUE)
       ON CONFLICT (chat_id) DO UPDATE SET is_admin = TRUE`,
      [chatId]
    );
  }

  static async listAdmins() {
    const { rows } = await pool.query(
      "SELECT chat_id, username FROM users WHERE is_admin = TRUE ORDER BY chat_id"
    );
    return rows;
  }

  static async allChatIds() {
    const { rows } = await pool.query("SELECT chat_id FROM users");
    return rows.map((r) => r.chat_id);
  }
};
