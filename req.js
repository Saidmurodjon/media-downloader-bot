const axios = require("axios");
async function Download(video_url) {
  try {
    const options = {
      method: "GET",
      url: "https://instagram-media-downloader.p.rapidapi.com/rapid/post.php",
      params: { url: video_url },
      headers: {
        "X-RapidAPI-Key": "e0bf555747msh4a23654011e1293p1c870djsn025f9fad413a",
        "X-RapidAPI-Host": "instagram-media-downloader.p.rapidapi.com",
      },
    };

    // const options = {
    //   method: "GET",
    //   url: "https://youtube-media-downloader.p.rapidapi.com/v2/video/details",
    //   params: { videoId: "UwPkicLIHNs" },
    //   headers: {
    //     "X-RapidAPI-Key": "e0bf555747msh4a23654011e1293p1c870djsn025f9fad413a",
    //     "X-RapidAPI-Host": "youtube-media-downloader.p.rapidapi.com",
    //   },
    // };
    const res = await axios.request(options);
    const result = {
      videoUrl: res.data.video,
      caption: res.data.caption,
    };

    return result;
  } catch (err) {
    console.log(err);
  }
}
module.exports = { Download };
// Download();
