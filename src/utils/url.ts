const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]+/i;
const INSTAGRAM_RE = /instagram\.com\/(?:p|reel|reels|stories)\/[\w-]+/i;
const TIKTOK_RE = /(?:tiktok\.com\/@[\w.]+\/video\/\d+|vm\.tiktok\.com\/[\w]+)/i;
const TWITTER_RE = /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/i;

export function isSupported(url: string): boolean {
  return (
    YOUTUBE_RE.test(url) ||
    INSTAGRAM_RE.test(url) ||
    TIKTOK_RE.test(url) ||
    TWITTER_RE.test(url)
  );
}
