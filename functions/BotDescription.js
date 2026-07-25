// Bot profile description (shown before a user's first message) and short
// description (shown in shares/forwards). Set via the Bot API directly
// (setMyDescription/setMyShortDescription) instead of BotFather, so it's
// versioned with the code and survives a bot token being swapped later.
// Telegraf's typings predate these methods, but callApi still reaches them
// at runtime since it's plain JS.
const logger = require("./logger");

const DESCRIPTIONS = {
  uz: "YouTube, Instagram va TikTok'dan video va audio yuklab beruvchi bot. Havolani yuboring va formatni tanlang.",
  ru: "Бот для скачивания видео и аудио с YouTube, Instagram и TikTok. Отправьте ссылку и выберите формат.",
  en: "Bot for downloading video and audio from YouTube, Instagram and TikTok. Send a link and pick a format.",
};

const SHORT_DESCRIPTIONS = {
  uz: "YouTube/Instagram/TikTok video va audio yuklovchi bot",
  ru: "Бот для скачивания видео/аудио с YouTube/Instagram/TikTok",
  en: "Download video/audio from YouTube/Instagram/TikTok",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = class BotDescription {
  static async apply(telegram) {
    const calls = [];
    for (const [language_code, description] of Object.entries(DESCRIPTIONS)) {
      calls.push(() => telegram.callApi("setMyDescription", { description, language_code }));
    }
    for (const [language_code, short_description] of Object.entries(SHORT_DESCRIPTIONS)) {
      calls.push(() =>
        telegram.callApi("setMyShortDescription", { short_description, language_code })
      );
    }
    // Default (no language_code) fallback for users whose Telegram app
    // language isn't uz/ru/en.
    calls.push(() => telegram.callApi("setMyDescription", { description: DESCRIPTIONS.uz }));
    calls.push(() =>
      telegram.callApi("setMyShortDescription", { short_description: SHORT_DESCRIPTIONS.uz })
    );

    // Firing all of these at once trips Telegram's rate limit (429) — this
    // only runs once at boot and isn't time-critical, so a small delay
    // between each sequential call is cheap insurance.
    const errors = [];
    for (const call of calls) {
      try {
        await call();
      } catch (err) {
        errors.push(err.message);
      }
      await sleep(300);
    }

    if (errors.length) {
      logger.warn("BotDescription.apply: some calls failed", { errors });
    }
  }
};
