require("dotenv").config();
const { env } = process;
module.exports = {
  TOKEN: env.TOKEN,
  MONGODB: env.MONGODB_URL,
};
