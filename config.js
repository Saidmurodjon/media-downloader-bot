require("dotenv").config();
const { env } = process;
module.exports = {
  TOKEN: env.TOKEN,
  PORT: env.PORT,
  BaseURL: env.BaseURL,
  DATABASE_URL: env.DATABASE_URL,
  BOT_API_URL: env.BOT_API_URL,
  YTDLP_PYTHON: env.YTDLP_PYTHON || "python",
  YTDLP_FFMPEG_LOCATION: env.YTDLP_FFMPEG_LOCATION || "",
  ADMIN_ID: env.ADMIN_ID,
  // How many downloads run at once. Concurrent yt-dlp/ffmpeg spawns can
  // exhaust process/DLL-init resources on a constrained dev machine (seen as
  // Windows STATUS_DLL_INIT_FAILED crashes at 3), so keep this conservative
  // locally; a VPS can raise it via the env var.
  DOWNLOAD_CONCURRENCY: Number(env.DOWNLOAD_CONCURRENCY) || 2,
  NGROK_BIN: env.NGROK_BIN || "ngrok",
  NGROK_AUTHTOKEN: env.NGROK_AUTHTOKEN || "",
};
