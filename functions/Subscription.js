const ChannelModel = require("../admin/ChannelModel");
const logger = require("./logger");

module.exports = class Subscription {
  static channelUrl(channel) {
    return `https://t.me/${channel.replace(/^@/, "")}`;
  }

  static async isMember(telegram, channel, userId) {
    try {
      const member = await telegram.getChatMember(channel, userId);
      return !["left", "kicked"].includes(member.status);
    } catch (err) {
      // Bot removed from the channel / channel deleted / etc. — fail open so
      // a misconfigured gate never locks every user out of the whole bot.
      logger.warn("subscription check failed", { channel, error: err.message });
      return true;
    }
  }

  // Channels the user still needs to join, out of every configured one.
  static async getMissingChannels(telegram, userId) {
    const channels = await ChannelModel.list();
    const missing = [];
    for (const channel of channels) {
      const subscribed = await Subscription.isMember(telegram, channel.username, userId);
      if (!subscribed) missing.push(channel.username);
    }
    return missing;
  }
};
