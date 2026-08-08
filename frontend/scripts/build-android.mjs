#!/usr/bin/env node
// Single entry point for `npm run build:android`. Syncs Android's versionCode/
// versionName to package.json's version (the source of truth for both web and
// native releases), then runs `cap sync` + a signed release bundle build.
// Requires frontend/android/app/keystore.properties to exist (see
// android-release-checklist.md) — gradlew will fail with an unsigned/debug-signed
// build otherwise.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(frontendRoot, "package.json"), "utf-8"));
const version = pkg.version; // e.g. "0.3.4"

const [major, minor, patch] = version.split(".").map(Number);
if ([major, minor, patch].some(Number.isNaN)) {
  throw new Error(`package.json version "${version}" isn't in major.minor.patch form`);
}
if (minor > 99 || patch > 99) {
  throw new Error(`versionCode encoding assumes minor/patch < 100, got "${version}" — bump the encoding scheme before releasing`);
}
// Play Store requires a strictly increasing integer per upload. Deriving it from
// semver (rather than a separate counter) means every web version bump that also
// ships mobile automatically gets a higher versionCode for free.
const versionCode = major * 10000 + minor * 100 + patch;

const gradlePath = path.join(frontendRoot, "android", "app", "build.gradle");
let gradle = readFileSync(gradlePath, "utf-8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
writeFileSync(gradlePath, gradle);
console.log(`[build:android] Set versionCode=${versionCode} versionName="${version}" from package.json`);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: frontendRoot, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

console.log("[build:android] Running cap sync android...");
run("npx", ["cap", "sync", "android"]);

console.log("[build:android] Running gradlew bundleRelease...");
const gradlew = process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew";
const androidDir = path.join(frontendRoot, "android");
const bundleResult = spawnSync(gradlew, ["bundleRelease"], { cwd: androidDir, stdio: "inherit", shell: true });
if (bundleResult.status !== 0) {
  throw new Error(`gradlew bundleRelease failed with exit code ${bundleResult.status}`);
}

const aabPath = path.join(androidDir, "app", "build", "outputs", "bundle", "release", "app-release.aab");
console.log(`[build:android] Done. AAB: ${aabPath}`);
