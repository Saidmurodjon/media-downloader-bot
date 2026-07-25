const { spawn, spawnSync } = require("child_process");
const http = require("http");
const { NGROK_BIN, NGROK_AUTHTOKEN } = require("../config");

let proc = null;
let authApplied = false;

function fetchTunnelUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:4040/api/tunnels", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const httpsTunnel = (json.tunnels || []).find((t) => t.proto === "https");
          resolve(httpsTunnel ? httpsTunnel.public_url : null);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("ngrok API timeout")));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = class Ngrok {
  static isRunning() {
    return proc !== null;
  }

  static async getUrl() {
    try {
      return await fetchTunnelUrl();
    } catch (err) {
      return null;
    }
  }

  static stop() {
    if (proc) {
      proc.kill();
      proc = null;
    }
  }

  // Starts the tunnel (idempotent — returns the existing one if already up)
  // and resolves once its public URL is available. Throws if ngrok isn't
  // installed, has no authtoken configured, or never comes up.
  static async start(port) {
    if (proc) {
      const existing = await Ngrok.getUrl();
      if (existing) return existing;
    }

    if (NGROK_AUTHTOKEN && !authApplied) {
      spawnSync(NGROK_BIN, ["config", "add-authtoken", NGROK_AUTHTOKEN]);
      authApplied = true;
    }

    proc = spawn(NGROK_BIN, ["http", String(port), "--log=stdout"], { stdio: "ignore" });
    proc.on("exit", () => {
      proc = null;
    });
    proc.on("error", () => {
      proc = null;
    });

    for (let attempt = 0; attempt < 20; attempt++) {
      await sleep(500);
      if (!proc) break; // process died (e.g. binary missing, bad authtoken)
      const url = await Ngrok.getUrl();
      if (url) return url;
    }

    Ngrok.stop();
    throw new Error("ngrok tunnel did not come up in time");
  }
};
