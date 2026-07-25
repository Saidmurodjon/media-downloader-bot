const path = require("path");
const winston = require("winston");
require("winston-daily-rotate-file");

const LOG_DIR = path.join(__dirname, "..", "logs");
const isProd = process.env.NODE_ENV === "production";

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Everything (info and above) — the day-by-day operational record.
const combinedTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, "app-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
});

// Warnings/errors only — a much shorter file to check first when the bot
// stops responding, instead of scrolling through the full combined log.
const errorTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, "error-%DATE%.log"),
  level: "warn",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "30d",
});

const logger = winston.createLogger({
  level: "info",
  format: fileFormat,
  transports: [combinedTransport, errorTransport],
});

// Console stays human-readable in dev; in production it's silent (the files
// are the source of truth, since nothing is watching a terminal there).
if (!isProd) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: "HH:mm:ss" }),
        winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
          delete meta[Symbol.for("level")];
          delete meta[Symbol.for("splat")];
          const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
          return `${timestamp} ${level}: ${stack || message}${metaStr}`;
        })
      ),
    })
  );
}

module.exports = logger;
