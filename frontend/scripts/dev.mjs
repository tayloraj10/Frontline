#!/usr/bin/env node
// Single entry point for `npm run dev`, used for both browser and Capacitor
// (Android emulator/physical device) testing. Auto-detects the host's LAN IP
// so NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_FASTAPI_URL/CAP_DEV_SERVER never need
// to be hand-edited when your network changes — see capacitor-testing-guide.md.
import { networkInterfaces } from "node:os";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ipCacheFile = path.join(frontendRoot, ".lan-ip-cache");

function detectLanIp() {
  const nets = networkInterfaces();
  for (const addrs of Object.values(nets)) {
    for (const net of addrs ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  throw new Error("Could not detect a LAN IPv4 address — are you connected to a network?");
}

const lanIp = detectLanIp();
const previousIp = existsSync(ipCacheFile) ? readFileSync(ipCacheFile, "utf-8").trim() : null;
const ipChanged = lanIp !== previousIp;

if (ipChanged) {
  console.log(`[dev] LAN IP is ${lanIp}${previousIp ? ` (was ${previousIp})` : ""}`);
  const nextCache = path.join(frontendRoot, ".next");
  if (existsSync(nextCache)) {
    // Turbopack's persistent cache can serve chunks with the old IP baked into
    // inlined NEXT_PUBLIC_* values instead of recompiling. See "Cache trap" in
    // capacitor-testing-guide.md.
    console.log("[dev] LAN IP changed — clearing .next to avoid stale env values");
    rmSync(nextCache, { recursive: true, force: true });
  }
  writeFileSync(ipCacheFile, lanIp);
}

const capDevServer = `http://${lanIp}:3000`;
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://${lanIp}:54321`,
  NEXT_PUBLIC_FASTAPI_URL: `http://${lanIp}:8000`,
  CAP_DEV_SERVER: capDevServer,
};

if (ipChanged && existsSync(path.join(frontendRoot, "android"))) {
  console.log(`[dev] Syncing Capacitor Android project to ${capDevServer}...`);
  const sync = spawnSync("npx", ["cap", "sync", "android"], {
    cwd: frontendRoot,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (sync.status !== 0) {
    console.warn("[dev] cap sync android failed — browser testing still works, but rebuild the Android app before testing there.");
  }
}

if (ipChanged && existsSync(path.join(frontendRoot, "ios"))) {
  console.log(`[dev] Syncing Capacitor iOS project to ${capDevServer}...`);
  const sync = spawnSync("npx", ["cap", "sync", "ios"], {
    cwd: frontendRoot,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (sync.status !== 0) {
    console.warn("[dev] cap sync ios failed — browser testing still works, but rebuild the iOS app before testing there.");
  }
}

console.log(`[dev] Browser: http://localhost:3000   Emulator/device: ${capDevServer}`);
spawn("npx", ["next", "dev"], { cwd: frontendRoot, env, stdio: "inherit", shell: true });
