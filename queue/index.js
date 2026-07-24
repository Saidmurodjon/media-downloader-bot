const PgBoss = require("pg-boss");
const { DATABASE_URL } = require("../config");
const cobalt = require("../services/cobalt");
const VideoCache = require("../db/VideoCache");
const { downloadAndSend } = require("./downloadAndSend");

const QUEUE_NAME = "download-video";
const boss = new PgBoss(DATABASE_URL);

boss.on("error", (err) => console.error("pg-boss error", err));

async function start(bot) {
  await boss.start();
  await boss.work(QUEUE_NAME, async (job) => {
    await processJob(bot, job.data);
  });
}

function enqueue(jobData) {
  return boss.send(QUEUE_NAME, jobData, { retryLimit: 2, expireInMinutes: 15 });
}

async function processJob(bot, { chatId, url, platform, statusMessageId }) {
  try {
    const mediaUrl = await cobalt.resolveMedia(url);
    const fileId = await downloadAndSend(bot, chatId, mediaUrl);
    if (fileId) await VideoCache.set(url, platform, fileId);
    if (statusMessageId) {
      await bot.telegram.deleteMessage(chatId, statusMessageId).catch(() => {});
    }
  } catch (err) {
    console.error("download job failed", err);
    await bot.telegram
      .sendMessage(chatId, "Yuklab olishda xatolik yuz berdi 😔")
      .catch(() => {});
  }
}

module.exports = { start, enqueue };
