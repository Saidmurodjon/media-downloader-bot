const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

async function downloadAndSend(bot, chatId, mediaUrl) {
  const tmpPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.mp4`);
  const response = await axios.get(mediaUrl, {
    responseType: "stream",
    timeout: 120000,
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tmpPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
    response.data.on("error", reject);
  });

  try {
    const message = await bot.telegram.sendVideo(chatId, { source: tmpPath });
    return message.video?.file_id || message.document?.file_id;
  } finally {
    fs.unlink(tmpPath, () => {});
  }
}

module.exports = { downloadAndSend };
