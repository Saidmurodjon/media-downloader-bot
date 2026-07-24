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
};
