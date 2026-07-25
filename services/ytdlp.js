const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { YTDLP_PYTHON, YTDLP_FFMPEG_LOCATION, BOT_API_URL } = require("../config");

// Telegram's Bot API caps uploads at 50MB unless a local bot-api server
// (BOT_API_URL) is running, which raises it to 2000MB.
const MAX_FILESIZE = BOT_API_URL ? "2000M" : "50M";

function sidecarBase(destPath) {
  return destPath.slice(0, -path.extname(destPath).length);
}

// yt-dlp writes title/duration/width/height as a JSON sidecar next to the
// media file (--write-info-json) and the cover art as a matching .jpg
// (--write-thumbnail + --convert-thumbnails jpg) — parsing those instead of
// a separate metadata request keeps this to one process per download.
function readMetadata(destPath) {
  const base = sidecarBase(destPath);
  let info = {};
  try {
    info = JSON.parse(fs.readFileSync(base + ".info.json", "utf8"));
  } catch (err) {
    // no sidecar (e.g. audio extraction can omit some fields) — fall back to nulls
  }

  const thumbPath = base + ".jpg";
  return {
    title: info.title || null,
    duration: Number.isFinite(info.duration) ? Math.round(info.duration) : undefined,
    width: info.width || undefined,
    height: info.height || undefined,
    thumbPath: fs.existsSync(thumbPath) ? thumbPath : null,
  };
}

function cleanupSidecars(destPath) {
  const base = sidecarBase(destPath);
  fs.unlink(base + ".info.json", () => {});
  fs.unlink(base + ".jpg", () => {});
}

function ffmpegBinary() {
  if (!YTDLP_FFMPEG_LOCATION) return "ffmpeg";
  return path.join(YTDLP_FFMPEG_LOCATION, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
}

// Telegram wants thumbnails no larger than 320x320, but source thumbnails
// (e.g. YouTube's) are typically 1280x720 — downscale to fit.
function resizeThumbnail(thumbPath) {
  return new Promise((resolve) => {
    const outPath = sidecarBase(thumbPath) + ".thumb.jpg";
    const proc = spawn(ffmpegBinary(), [
      "-y",
      "-i",
      thumbPath,
      "-vf",
      "scale='min(320,iw)':'min(320,ih)':force_original_aspect_ratio=decrease",
      outPath,
    ]);
    proc.on("error", () => resolve(thumbPath));
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) {
        fs.unlink(thumbPath, () => {});
        return resolve(outPath);
      }
      resolve(thumbPath);
    });
  });
}

// Downloads url straight to destPath, capped at 480p (video) so files stay
// well under Telegram's upload limit. Runs "python -m yt_dlp" instead of
// relying on a yt-dlp binary being on PATH, so it works the same way on
// Windows (dev) and Linux (prod) as long as `python`/`python3` resolves.
// Resolves with { title, duration, width, height, thumbPath } on success.
function downloadVideo(url, destPath, format = "video") {
  return new Promise((resolve, reject) => {
    const args = ["-m", "yt_dlp"];
    if (format === "audio") {
      args.push("-f", "bestaudio/best", "-x", "--audio-format", "mp3");
    } else {
      args.push("-f", "bv*[height<=480]+ba/b[height<=480]/best", "--merge-output-format", "mp4");
    }
    args.push(
      "--max-filesize",
      MAX_FILESIZE,
      "--no-playlist",
      "--no-progress",
      "--write-info-json",
      "--write-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "-o",
      destPath,
      url
    );
    if (YTDLP_FFMPEG_LOCATION) {
      args.push("--ffmpeg-location", YTDLP_FFMPEG_LOCATION);
    }

    const proc = spawn(YTDLP_PYTHON, args);
    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    proc.on("error", reject);
    proc.on("close", async (code) => {
      // --max-filesize aborts still exit 0 with no file written, so a
      // missing output file has to be checked even on "success".
      if (code === 0 && !fs.existsSync(destPath)) {
        cleanupSidecars(destPath);
        if (/larger than max-filesize/i.test(stdout)) {
          return reject(new Error("file_too_large"));
        }
        return reject(new Error("empty_download"));
      }
      if (code === 0) {
        const meta = readMetadata(destPath);
        fs.unlink(sidecarBase(destPath) + ".info.json", () => {});
        if (meta.thumbPath) meta.thumbPath = await resizeThumbnail(meta.thumbPath);
        return resolve(meta);
      }
      cleanupSidecars(destPath);
      // A nonzero exit with no stderr at all (nothing logged, not even a
      // warning) means the process itself crashed before yt-dlp could run —
      // e.g. Windows STATUS_DLL_INIT_FAILED (0xC0000142) under process/
      // resource contention from concurrent downloads. Transient, not a
      // broken link, so it's tagged for the same retry path as empty_download.
      if (!stderr.trim()) {
        return reject(new Error("process_crash"));
      }
      reject(new Error(stderr.trim()));
    });
  });
}

module.exports = { downloadVideo };
