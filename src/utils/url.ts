// YouTube: standard, shorts, mobile, youtu.be, embed, live
const YOUTUBE_RE =
  /(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)[\w-]{11}/i;

// Instagram: posts, reels, stories (with or without trailing slash)
const INSTAGRAM_RE =
  /(?:www\.)?instagram\.com\/(?:p|reel|reels|stories|tv)\/[\w-]+/i;

// TikTok: long and short links
const TIKTOK_RE =
  /(?:(?:www\.)?tiktok\.com\/@[\w.]+\/video\/\d+|vm\.tiktok\.com\/[\w]+|vt\.tiktok\.com\/[\w]+)/i;

// Twitter / X
const TWITTER_RE =
  /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/i;

export function isSupported(url: string): boolean {
  const clean = url.trim();
  return (
    YOUTUBE_RE.test(clean) ||
    INSTAGRAM_RE.test(clean) ||
    TIKTOK_RE.test(clean) ||
    TWITTER_RE.test(clean)
  );
}
