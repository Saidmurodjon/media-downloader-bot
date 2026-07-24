const AdminModel = require("../admin/AdminModel");
const BroadcastModel = require("../admin/BroadcastModel");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Telegram's global rate limit is ~30 messages/sec; 20/sec leaves headroom
// for the download queue running concurrently.
const THROTTLE_MS = 50;

// Telegram rejects photo/video captions longer than this — send the media
// without a caption and follow up with the full text as its own message
// instead (matches how long channel posts are structured in the first place).
const MAX_CAPTION_LENGTH = 1024;

function buildReplyMarkup(button) {
  if (!button) return undefined;
  return { inline_keyboard: [[{ text: button.text, url: button.url }]] };
}

function splitCaption(caption, entities) {
  if (!caption || caption.length <= MAX_CAPTION_LENGTH) {
    return { mediaCaption: caption, mediaCaptionEntities: entities, overflow: null };
  }
  return { mediaCaption: undefined, mediaCaptionEntities: undefined, overflow: { text: caption, entities } };
}

// Media groups (albums) can't carry an inline keyboard (Telegram API
// limitation), so a button on an album goes out as a tiny follow-up message.
async function sendContent(bot, chatId, content, replyMarkup) {
  if (content.type === "album") {
    const first = content.items[0];
    const { mediaCaption, mediaCaptionEntities, overflow } = splitCaption(
      first?.caption,
      first?.caption_entities
    );
    const media = content.items.map((item, i) => ({
      type: "photo",
      media: item.file_id,
      caption: i === 0 ? mediaCaption : undefined,
      caption_entities: i === 0 ? mediaCaptionEntities : undefined,
    }));
    await bot.telegram.sendMediaGroup(chatId, media);
    if (overflow) {
      await bot.telegram.sendMessage(chatId, overflow.text, {
        entities: overflow.entities,
        reply_markup: replyMarkup,
      });
    } else if (replyMarkup) {
      await bot.telegram.sendMessage(chatId, "🔗", { reply_markup: replyMarkup });
    }
    return;
  }

  if (content.type === "photo" || content.type === "video") {
    const { mediaCaption, mediaCaptionEntities, overflow } = splitCaption(
      content.caption,
      content.caption_entities
    );
    const send = content.type === "photo" ? bot.telegram.sendPhoto : bot.telegram.sendVideo;
    await send.call(bot.telegram, chatId, content.file_id, {
      caption: mediaCaption,
      caption_entities: mediaCaptionEntities,
      reply_markup: overflow ? undefined : replyMarkup,
    });
    if (overflow) {
      await bot.telegram.sendMessage(chatId, overflow.text, {
        entities: overflow.entities,
        reply_markup: replyMarkup,
      });
    }
    return;
  }

  return bot.telegram.sendMessage(chatId, content.text, {
    entities: content.entities,
    reply_markup: replyMarkup,
  });
}

async function sendBroadcast(bot, { broadcastId, adminChatId, content, button }) {
  const chatIds = await AdminModel.allChatIds();
  const replyMarkup = buildReplyMarkup(button);
  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      await sendContent(bot, chatId, content, replyMarkup);
      sent++;
    } catch (err) {
      failed++;
    }
    await sleep(THROTTLE_MS);
  }

  await BroadcastModel.recordResult(broadcastId, sent, failed);
  await bot.telegram
    .sendMessage(adminChatId, `✅ Reklama yuborildi.\nMuvaffaqiyatli: ${sent}\nXato: ${failed}`)
    .catch(() => {});
}

module.exports = { sendBroadcast, sendContent };
