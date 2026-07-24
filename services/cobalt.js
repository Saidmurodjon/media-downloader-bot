const axios = require("axios");
const { COBALT_API_URL, COBALT_API_KEY } = require("../config");

// API contract matches self-hosted cobalt (https://github.com/imputnet/cobalt) —
// double-check field names against the deployed instance's version before relying on this.
async function resolveMedia(url) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (COBALT_API_KEY) headers.Authorization = `Api-Key ${COBALT_API_KEY}`;

  const { data } = await axios.post(
    COBALT_API_URL,
    { url, videoQuality: "720", downloadMode: "auto" },
    { headers, timeout: 20000 }
  );

  if (data.status === "error") {
    throw new Error(data.error?.code || "cobalt_error");
  }
  if (data.status === "picker" && Array.isArray(data.picker)) {
    const item = data.picker.find((p) => p.type === "video") || data.picker[0];
    if (!item?.url) throw new Error("cobalt_no_media");
    return item.url;
  }
  if (!data.url) throw new Error("cobalt_no_media");
  return data.url;
}

module.exports = { resolveMedia };
