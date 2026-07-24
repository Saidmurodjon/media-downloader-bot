const BotInfo = require("./BotInfo");
const BotSettings = require("../admin/BotSettings");

const GROUP_BUTTON_KEY = "show_add_to_group_button";

module.exports = class MediaMessage {
  static buildCaption(title) {
    const username = BotInfo.getUsername();
    const lines = [];
    if (title) lines.push(title);
    if (username) lines.push(`📥 @${username}`);
    return lines.length ? lines.join("\n\n") : undefined;
  }

  static async buildReplyMarkup() {
    const enabled = await MediaMessage.isGroupButtonEnabled();
    const username = BotInfo.getUsername();
    if (!enabled || !username) return undefined;
    return {
      inline_keyboard: [
        [{ text: "➕ Guruhga qo'shish", url: `https://t.me/${username}?startgroup=true` }],
      ],
    };
  }

  static async isGroupButtonEnabled() {
    return (await BotSettings.get(GROUP_BUTTON_KEY)) === "true";
  }

  static async setGroupButtonEnabled(enabled) {
    await BotSettings.set(GROUP_BUTTON_KEY, enabled ? "true" : "false");
  }
};
