#!/usr/bin/env node
// Syncs iOS's MARKETING_VERSION to package.json's version (the source of
// truth for web and native releases) and bumps CURRENT_PROJECT_VERSION by 1.
// Run before every archive. Apple requires each upload's build number to be
// strictly greater than every previous upload for this app, across *all*
// marketing versions — not just within the current one — so the build number
// can't be derived from the semver (two archives of the same 0.3.4 would
// collide) and instead just counts up on its own regardless of version.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(frontendRoot, "package.json"), "utf-8"));
const version = pkg.version; // e.g. "0.3.4"

const pbxprojPath = path.join(frontendRoot, "ios", "App", "Frontline Maps.xcodeproj", "project.pbxproj");
let pbxproj = readFileSync(pbxprojPath, "utf-8");

const currentBuildNumbers = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1]));
if (currentBuildNumbers.length === 0) {
  throw new Error("No CURRENT_PROJECT_VERSION found in project.pbxproj");
}
const nextBuildNumber = Math.max(...currentBuildNumbers) + 1;

pbxproj = pbxproj.replaceAll(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${nextBuildNumber};`);
pbxproj = pbxproj.replaceAll(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${version};`);
writeFileSync(pbxprojPath, pbxproj);
console.log(`[sync:ios-version] Set MARKETING_VERSION=${version} CURRENT_PROJECT_VERSION=${nextBuildNumber} from package.json`);
