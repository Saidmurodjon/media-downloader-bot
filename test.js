const {
  downloader: Downloader,
  fetchUser: User,
  fetchStories: Stories,
  Util: Util,
  fetchHighlights: Highlights,
  fetchPosts: Posts,
} = require("instagram-url-downloader");

const test = async () => {
  const downloader = new Downloader("https://www.instagram.com/p/CfjQlzfIXFr/");
  console.log(downloader.Media);
};
test();
