const { pool } = require("./index");

module.exports = class VideoCache {
  static async get(url) {
    const { rows } = await pool.query(
      "SELECT file_id, platform FROM video_cache WHERE url = $1",
      [url]
    );
    return rows[0] || null;
  }

  static async set(url, platform, fileId) {
    await pool.query(
      `INSERT INTO video_cache (url, platform, file_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (url) DO UPDATE SET file_id = EXCLUDED.file_id`,
      [url, platform, fileId]
    );
  }
};
