const Ngrok = require("./Ngrok");
const logger = require("./logger");

const CHECK_INTERVAL_MS = 30000;
// Hysteresis: don't switch on a single blip in either direction, and don't
// switch back to webhook the instant it looks reachable — avoids flapping
// between modes on a flaky tunnel.
const UNHEALTHY_THRESHOLD = 2;
const RECOVER_THRESHOLD = 2;

// Runs the bot on webhook (via ngrok) when available, falling back to
// long-polling when it isn't — and switching back once the tunnel recovers.
// Telegram only accepts updates one way at a time, so "hybrid" here means
// continuously monitoring and toggling between the two, not running both
// at once.
module.exports = class ConnectionManager {
  constructor(bot, { port, allowedUpdates }) {
    this.bot = bot;
    this.port = port;
    this.allowedUpdates = allowedUpdates;
    this.mode = null;
    this.badCount = 0;
    this.goodCount = 0;
  }

  async start() {
    let url = null;
    try {
      url = await Ngrok.start(this.port);
    } catch (err) {
      logger.warn("ngrok failed to start, using polling", { error: err.message });
    }

    if (url) {
      await this.switchToWebhook(url);
    } else {
      await this.switchToPolling();
    }

    this.timer = setInterval(() => {
      this.check().catch((err) => logger.error("ConnectionManager check failed", { error: err.stack || String(err) }));
    }, CHECK_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  async switchToPolling() {
    if (this.mode === "polling") return;
    await this.bot.telegram.deleteWebhook().catch(() => {});
    this.bot.startPolling(this.allowedUpdates);
    this.mode = "polling";
    this.badCount = 0;
    logger.info("ConnectionManager switched to POLLING");
  }

  async switchToWebhook(url) {
    if (this.mode === "webhook") return;
    this.bot.polling?.stop();
    await this.bot.telegram.setWebhook(`${url}/`, { allowed_updates: this.allowedUpdates });
    this.mode = "webhook";
    this.goodCount = 0;
    logger.info("ConnectionManager switched to WEBHOOK", { url });
  }

  async check() {
    if (this.mode === "webhook") {
      return this.checkWebhookHealth();
    }
    return this.checkForRecovery();
  }

  async checkWebhookHealth() {
    const info = await this.bot.telegram.getWebhookInfo();
    const tunnelUrl = Ngrok.isRunning() ? await Ngrok.getUrl() : null;
    const recentError =
      info.last_error_date &&
      Date.now() / 1000 - info.last_error_date < (CHECK_INTERVAL_MS / 1000) * 2;
    const healthy = Boolean(info.url) && Boolean(tunnelUrl) && !recentError;

    if (healthy) {
      this.badCount = 0;
      return;
    }

    this.badCount++;
    logger.warn("ConnectionManager webhook unhealthy", {
      badCount: this.badCount,
      threshold: UNHEALTHY_THRESHOLD,
      reason: info.last_error_message || "(no ngrok tunnel)",
    });
    if (this.badCount >= UNHEALTHY_THRESHOLD) {
      await this.switchToPolling();
    }
  }

  async checkForRecovery() {
    let url = await Ngrok.getUrl();
    if (!url && !Ngrok.isRunning()) {
      try {
        url = await Ngrok.start(this.port);
      } catch (err) {
        // still down — stay on polling
      }
    }

    if (!url) {
      this.goodCount = 0;
      return;
    }

    this.goodCount++;
    if (this.goodCount >= RECOVER_THRESHOLD) {
      await this.switchToWebhook(url);
    }
  }
};
