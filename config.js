require("dotenv").config();
const { env } = process;
module.exports = {
  TOKEN: env.TOKEN,
  PORT: env.PORT,
  BaseURL: env.BaseURL,
  DATABASE_URL: env.DATABASE_URL,
  COBALT_API_URL: env.COBALT_API_URL,
  COBALT_API_KEY: env.COBALT_API_KEY,
  BOT_API_URL: env.BOT_API_URL,
};
