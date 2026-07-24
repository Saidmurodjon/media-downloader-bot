const ChannelModel = require("../admin/ChannelModel");
const AdminModel = require("../admin/AdminModel");

const ACTIVE_STATUSES = ["member", "administrator", "creator"];

// Fires on every membership change in any channel the bot is admin of.
// Telegram only starts sending these from the moment the bot gained admin
// rights there — there's no way to backfill members who joined earlier.
async function handleChatMemberUpdate(bot, update) {
  const chat = update.chat;
  if (!chat.username) return;

  const username = "@" + chat.username;
  const channel = await ChannelModel.get(username);
  if (!channel) return;

  const wasMember = ACTIVE_STATUSES.includes(update.old_chat_member.status);
  const isMember = ACTIVE_STATUSES.includes(update.new_chat_member.status);
  if (wasMember === isMember) return;

  const userId = update.new_chat_member.user.id;
  if (isMember) {
    await ChannelModel.recordEvent(username, userId, "joined");
    await checkTarget(bot, channel, username);
  } else {
    await ChannelModel.recordEvent(username, userId, "left");
  }
}

async function checkTarget(bot, channel, username) {
  if (!channel.target_count || channel.target_notified) return;

  let count;
  try {
    count = await bot.telegram.getChatMemberCount(username);
  } catch (err) {
    return;
  }
  if (count < channel.target_count) return;

  await ChannelModel.markTargetNotified(username);
  const admins = await AdminModel.listAdmins();
  const text =
    `🎉 ${username} kanali rejalashtirilgan obunachilar soniga yetdi!\n` +
    `Reja: ${channel.target_count}\nHozirgi: ${count}`;
  for (const admin of admins) {
    await bot.telegram.sendMessage(admin.chat_id, text).catch(() => {});
  }
}

module.exports = { handleChatMemberUpdate };
