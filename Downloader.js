const axios = require("axios");
// const { Instagram } = require("social-downloader-cherry");

async function Tiktok(video_url) {
  try {
    const options = {
      method: "GET",
      url: "https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/vid/index",
      params: {
        url: video_url,
      },
      headers: {
        "X-RapidAPI-Key": "e0bf555747msh4a23654011e1293p1c870djsn025f9fad413a",
        "X-RapidAPI-Host":
          "tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com",
      },
    };

    const res = await axios.request(options);
    console.log(res.data);
    const result = {
      videoUrl: res.data.video ? res.data.video[0] : false,
      caption: res.data.author
        ? res.data.author[0] + "\n @UpperDownloaderBot"
        : false,
    };

    return result;
  } catch (err) {
    console.log(err);
  }
}
async function Instagrams(video_url) {
  try {
    // const options = {
    //   method: "GET",
    //   url: "https://instagram-media-downloader.p.rapidapi.com/rapid/post.php",
    //   params: { url: video_url },
    //   headers: {
    //     "X-RapidAPI-Key": "e0bf555747msh4a23654011e1293p1c870djsn025f9fad413a",
    //     "X-RapidAPI-Host": "instagram-media-downloader.p.rapidapi.com",
    //   },
    // };
    // const res = await axios.request(options);
    const res = await Instagram.getAny(video_url);
    console.log(video_url);

    console.log( res);
    if (res.data.errorCode === 0) {
      const result = {
        videoUrl: res.data.body.link,
        caption: "@UpperDownloaderBot",
      };
      return result;
    }
  } catch (err) {
    console.log(err);
  }
}
async function Youtube(video_url) {
  try {
    // const options = {
    //   method: "GET",
    //   url: "https://youtube-media-downloader.p.rapidapi.com/v2/video/details",
    //   params: { videoId: "3VHCxuxtuL8" },
    //   headers: {
    //     "X-RapidAPI-Key": "e0bf555747msh4a23654011e1293p1c870djsn025f9fad413a",
    //     "X-RapidAPI-Host": "youtube-media-downloader.p.rapidapi.com",
    //   },
    // };
    // const res = await axios.request(options);
    // const result = {
    //   videoUrl: res.data.videos.items[0].url,
    //   caption: res.data.videos.items[0].caption,
    // };
    // // console.log(res.data.videos.items[0]);
    // return result;
  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  Tiktok,
  Youtube,
  Instagrams,
  };
// Download();
