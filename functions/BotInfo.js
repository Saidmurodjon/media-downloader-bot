let username = null;

module.exports = class BotInfo {
  static async init(telegram) {
    const me = await telegram.getMe();
    username = me.username;
  }

  static getUsername() {
    return username;
  }
};
