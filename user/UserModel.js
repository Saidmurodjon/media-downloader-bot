const { pool } = require("../db");

module.exports = class UserModel {
  static async findOne(chatId) {
    const { rows } = await pool.query(
      "SELECT chat_id, username, language, step FROM users WHERE chat_id = $1",
      [chatId]
    );
    return rows[0] || null;
  }

  static async create({ chatId, userName, step = 1, language = "" }) {
    const { rows } = await pool.query(
      `INSERT INTO users (chat_id, username, step, language)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chat_id) DO NOTHING
       RETURNING chat_id, username, language, step`,
      [chatId, userName, step, language]
    );
    return rows[0] || null;
  }

  static async updateLanguage(chatId, language, step = 2) {
    const { rows } = await pool.query(
      `UPDATE users SET language = $2, step = $3 WHERE chat_id = $1
       RETURNING chat_id, username, language, step`,
      [chatId, language, step]
    );
    return rows[0] || null;
  }
};
