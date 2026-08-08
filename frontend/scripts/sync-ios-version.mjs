#!/usr/bin/env node
// Syncs iOS's MARKETING_VERSION/CURRENT_PROJECT_VERSION to package.json's
// version (the source of truth for web and native releases), mirroring
// build-android.mjs's versionCode encoding so both platforms stay in lockstep.
// Run before every archive — App Store Connect rejects an upload whose build
// number isn't strictly greater than the last one, same as the Play Store.
import { readFileSync, writeFileSync } from "node:fs";
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
  throw new Error(`build number encoding assumes minor/patch < 100, got "${version}" — bump the encoding scheme before releasing`);
}
const buildNumber = major * 10000 + minor * 100 + patch;

const pbxprojPath = path.join(frontendRoot, "ios", "App", "App.xcodeproj", "project.pbxproj");
let pbxproj = readFileSync(pbxprojPath, "utf-8");
pbxproj = pbxproj.replaceAll(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);
pbxproj = pbxproj.replaceAll(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${version};`);
writeFileSync(pbxprojPath, pbxproj);
console.log(`[sync:ios-version] Set MARKETING_VERSION=${version} CURRENT_PROJECT_VERSION=${buildNumber} from package.json`);
