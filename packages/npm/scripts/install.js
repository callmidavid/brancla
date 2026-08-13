const fs = require("fs");
const https = require("https");
const path = require("path");

const packageJson = require("../package.json");

const platformKey = getPlatformKey();
const binaryName = process.platform === "win32" ? "brancla.exe" : "brancla";
const assetName = `brancla-${platformKey}${process.platform === "win32" ? ".exe" : ""}`;
const vendorDir = path.resolve(__dirname, "..", "vendor");
const destination = path.join(vendorDir, binaryName);
const version = process.env.BRANCLA_VERSION || packageJson.version;
const baseUrl =
  process.env.BRANCLA_DOWNLOAD_BASE ||
  `https://github.com/callmidavid/brancla/releases/download/v${version}`;

fs.mkdirSync(vendorDir, { recursive: true });

download(`${baseUrl}/${assetName}`, destination)
  .then(() => {
    if (process.platform !== "win32") {
      fs.chmodSync(destination, 0o755);
    }
  })
  .catch((error) => {
    console.error(`Failed to install Brancla CLI binary: ${error.message}`);
    console.error(`Expected release asset: ${assetName}`);
    process.exit(1);
  });

function getPlatformKey() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${process.platform}-${arch}`;
}

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        if (redirects > 5) {
          reject(new Error("too many redirects"));
          return;
        }
        download(new URL(location, url).toString(), destination, redirects + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination, { mode: 0o755 });
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });

    request.on("error", reject);
    request.setTimeout(30000, () => request.destroy(new Error("download timed out")));
  });
}
