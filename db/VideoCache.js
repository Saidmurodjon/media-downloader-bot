const { pool } = require("./index");

module.exports = class VideoCache {
  static async get(url, format) {
    const { rows } = await pool.query(
      "SELECT file_id, platform, title FROM video_cache WHERE url = $1 AND format = $2",
      [url, format]
    );
    return rows[0] || null;
  }

  static async set(url, platform, format, fileId, title) {
    await pool.query(
      `INSERT INTO video_cache (url, format, platform, file_id, title)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (url, format) DO UPDATE SET file_id = EXCLUDED.file_id, title = EXCLUDED.title`,
      [url, format, platform, fileId, title || null]
    );
  }
};
