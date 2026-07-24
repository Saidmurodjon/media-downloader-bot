const AdminModel = require("../admin/AdminModel");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Telegram's global rate limit is ~30 messages/sec; 20/sec leaves headroom
// for the download queue running concurrently.
const THROTTLE_MS = 50;

async function sendBroadcast(bot, { adminChatId, fromChatId, messageId }) {
  const chatIds = await AdminModel.allChatIds();
  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      await bot.telegram.copyMessage(chatId, fromChatId, messageId);
      sent++;
    } catch (err) {
      failed++;
    }
    await sleep(THROTTLE_MS);
  }

  await bot.telegram
    .sendMessage(adminChatId, `✅ Reklama yuborildi.\nMuvaffaqiyatli: ${sent}\nXato: ${failed}`)
    .catch(() => {});
}

module.exports = { sendBroadcast };
