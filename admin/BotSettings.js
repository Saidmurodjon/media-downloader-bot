const { pool } = require("../db");

module.exports = class BotSettings {
  static async get(key) {
    const { rows } = await pool.query("SELECT value FROM bot_settings WHERE key = $1", [key]);
    return rows[0]?.value ?? null;
  }

  static async set(key, value) {
    await pool.query(
      `INSERT INTO bot_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
};
