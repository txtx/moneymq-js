#!/usr/bin/env node

/**
 * Syncs the version from root package.json to all workspace packages.
 * This script runs automatically via the npm `version` lifecycle hook.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const packagesDir = join(rootDir, "packages");

// Read root package.json version
const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const version = rootPkg.version;

console.log(`Syncing version ${version} to all packages...`);

// Find all packages
const packages = readdirSync(packagesDir).filter((name) => {
  const pkgPath = join(packagesDir, name);
  return (
    statSync(pkgPath).isDirectory() &&
    statSync(join(pkgPath, "package.json")).isFile()
  );
});

// Update each package
for (const pkg of packages) {
  const pkgJsonPath = join(packagesDir, pkg, "package.json");
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

  if (pkgJson.version !== version) {
    pkgJson.version = version;
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
    console.log(`  Updated ${pkgJson.name} to ${version}`);
  } else {
    console.log(`  ${pkgJson.name} already at ${version}`);
  }
}

console.log("Done!");
