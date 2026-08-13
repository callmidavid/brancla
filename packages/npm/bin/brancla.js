#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const binaryName = process.platform === "win32" ? "brancla.exe" : "brancla";
const binaryPath = path.resolve(__dirname, "..", "vendor", binaryName);

if (!fs.existsSync(binaryPath)) {
  console.error(
    "Brancla CLI binary is missing. Re-run `npm install -g brancla` or run `npm rebuild -g brancla`.",
  );
  process.exit(1);
}

const result = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
