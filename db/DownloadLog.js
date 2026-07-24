const { pool } = require("./index");

module.exports = class DownloadLog {
  static async log(chatId, platform, cached) {
    await pool.query(
      "INSERT INTO downloads (chat_id, platform, cached) VALUES ($1, $2, $3)",
      [chatId, platform, cached]
    );
  }

  static async stats() {
    const [{ rows: userRows }, { rows: platformRows }, { rows: totalRows }] =
      await Promise.all([
        pool.query("SELECT COUNT(*)::int AS count FROM users"),
        pool.query(
          "SELECT platform, COUNT(*)::int AS count FROM downloads GROUP BY platform ORDER BY count DESC"
        ),
        pool.query(
          "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE cached)::int AS cached FROM downloads"
        ),
      ]);

    return {
      totalUsers: userRows[0].count,
      byPlatform: platformRows,
      totalDownloads: totalRows[0].total,
      cachedDownloads: totalRows[0].cached,
    };
  }
};
