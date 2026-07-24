const PgBoss = require("pg-boss");
const { DATABASE_URL } = require("../config");
const VideoCache = require("../db/VideoCache");
const DownloadLog = require("../db/DownloadLog");
const { downloadAndSend } = require("./downloadAndSend");
const { sendBroadcast } = require("./broadcast");
const texts = require("../text.json");

const QUEUE_NAME = "download-video";
const BROADCAST_QUEUE_NAME = "broadcast-message";
const boss = new PgBoss(DATABASE_URL);

function t(lang, key) {
  return (texts[lang] && texts[lang][key]) || texts.in[key];
}

// yt-dlp failures come through as "ERROR: ..." lines from its stderr (video
// removed/private/region-locked/etc.) — those mean the link itself can't be
// fetched, not a transient failure. "empty_download" is our own guard for a
// 0-byte result that slipped past a 0-exit-code run.
function errorKey(err) {
  const msg = String(err.message || "");
  const description = err.response?.description || err.description || "";

  if (err.code === "ECONNABORTED" || /timed? ?out/i.test(msg)) {
    return "err_timeout";
  }
  if (
    msg === "file_too_large" ||
    err.response?.status === 413 ||
    /too big|too large|entity too large/i.test(description) ||
    /too large|too big/i.test(msg)
  ) {
    return "err_toolarge";
  }
  if (msg.startsWith("ERROR:") || msg === "empty_download") {
    return "err_unavailable";
  }
  return "er";
}

boss.on("error", (err) => console.error("pg-boss error", err));

// pg-boss defaults to teamSize/teamConcurrency of 1 — one job at a time,
// globally. Without this, a second user's download just waits behind the
// first user's, even though downloads are network-bound (not CPU-bound) and
// have plenty of room to run side by side.
const DOWNLOAD_CONCURRENCY = 3;

async function start(bot) {
  await boss.start();
  await boss.work(
    QUEUE_NAME,
    { teamSize: DOWNLOAD_CONCURRENCY, teamConcurrency: DOWNLOAD_CONCURRENCY },
    async (job) => {
      await processJob(bot, job.data);
    }
  );
  await boss.work(BROADCAST_QUEUE_NAME, async (job) => {
    await sendBroadcast(bot, job.data);
  });
}

function enqueue(jobData) {
  return boss.send(QUEUE_NAME, jobData, { retryLimit: 2, expireInMinutes: 15 });
}

function enqueueBroadcast(jobData) {
  return boss.send(BROADCAST_QUEUE_NAME, jobData, { retryLimit: 0, expireInMinutes: 30 });
}

// Worth one retry since an "empty_download" is occasionally a transient
// network glitch rather than a permanently broken/restricted link.
const EMPTY_DOWNLOAD_RETRIES = 1;

async function downloadWithRetry(bot, chatId, url, format) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await downloadAndSend(bot, chatId, url, format);
    } catch (err) {
      if (err.message === "empty_download" && attempt < EMPTY_DOWNLOAD_RETRIES) {
        continue;
      }
      throw err;
    }
  }
}

async function processJob(bot, { chatId, url, platform, format = "video", statusMessageId, language }) {
  try {
    const { fileId, title } = await downloadWithRetry(bot, chatId, url, format);
    if (fileId) await VideoCache.set(url, platform, format, fileId, title);
    await DownloadLog.log(chatId, platform, false);
    if (statusMessageId) {
      await bot.telegram.deleteMessage(chatId, statusMessageId).catch(() => {});
    }
  } catch (err) {
    console.error("download job failed", err);
    await bot.telegram
      .sendMessage(chatId, t(language, errorKey(err)))
      .catch(() => {});
  }
}

module.exports = { start, enqueue, enqueueBroadcast };
