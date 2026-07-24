const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { downloadVideo } = require("../services/ytdlp");
const MediaMessage = require("../functions/MediaMessage");

async function downloadAndSend(bot, chatId, url, format = "video") {
  const ext = format === "audio" ? "mp3" : "mp4";
  const tmpPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.${ext}`);

  const meta = await downloadVideo(url, tmpPath, format);

  if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size === 0) {
    fs.unlink(tmpPath, () => {});
    if (meta.thumbPath) fs.unlink(meta.thumbPath, () => {});
    throw new Error("empty_download");
  }

  const extra = {
    caption: MediaMessage.buildCaption(meta.title),
    reply_markup: await MediaMessage.buildReplyMarkup(),
  };
  if (meta.thumbPath) extra.thumb = { source: meta.thumbPath };
  if (format === "video") {
    extra.supports_streaming = true;
    if (meta.duration) extra.duration = meta.duration;
    if (meta.width) extra.width = meta.width;
    if (meta.height) extra.height = meta.height;
  } else if (meta.duration) {
    extra.duration = meta.duration;
  }

  try {
    const message =
      format === "audio"
        ? await bot.telegram.sendAudio(chatId, { source: tmpPath }, extra)
        : await bot.telegram.sendVideo(chatId, { source: tmpPath }, extra);
    const fileId = message.audio?.file_id || message.video?.file_id || message.document?.file_id;
    return { fileId, title: meta.title };
  } finally {
    fs.unlink(tmpPath, () => {});
    if (meta.thumbPath) fs.unlink(meta.thumbPath, () => {});
  }
}

module.exports = { downloadAndSend };
