const axios = require("axios");
async function Instagram(video_url) {
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
async function Tiktok(video_url) {
  try {
    const options = {
      method: 'GET',
      url: 'https://tiktok-download-without-watermark.p.rapidapi.com/analysis',
      params: {url: 'https://vt.tiktok.com/ZSd4tMhnb/'},
      headers: {
        'X-RapidAPI-Key': 'e0bf555747msh4a23654011e1293p1c870djsn025f9fad413a',
        'X-RapidAPI-Host': 'tiktok-download-without-watermark.p.rapidapi.com'
      }
    };
    
    
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
async function Youtube(video_url) {
  try {
    const options = {
      method: "GET",
      url: "https://youtube-media-downloader.p.rapidapi.com/v2/video/details",
      params: { videoId: "3VHCxuxtuL8" },
      headers: {
        "X-RapidAPI-Key": "e0bf555747msh4a23654011e1293p1c870djsn025f9fad413a",
        "X-RapidAPI-Host": "youtube-media-downloader.p.rapidapi.com",
      },
    };

    const res = await axios.request(options);
    const result = {
      videoUrl: res.data.videos.items[0].url,
      caption: res.data.videos.items[0].caption,
    };
    // console.log(res.data.videos.items[0]);
    return result;
  } catch (err) {
    console.log(err);
  }
}

module.exports = { Instagram, Tiktok, Youtube };
// Download();
