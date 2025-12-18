#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const versionType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(versionType)) {
  console.error('Usage: node scripts/release.js [patch|minor|major]');
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: rootDir, ...opts });
}

function hasUncommittedChanges() {
  try {
    const status = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf-8' });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

try {
  // 1. Build all packages
  console.log('\n📦 Building packages...');
  run('pnpm build');

  // 2. Commit any uncommitted changes
  if (hasUncommittedChanges()) {
    console.log('\n📝 Committing changes...');
    run('git add -A');
    run(`git commit -m "chore: pre-release changes"`);
  }

  // 3. Bump version (triggers sync-versions.js via npm version hook)
  console.log(`\n🔢 Bumping ${versionType} version...`);
  run(`npm version ${versionType}`);

  // 4. Get new version
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
  const version = pkg.version;
  console.log(`\n📌 New version: ${version}`);

  // 5. Publish public packages
  const publicPackages = ['sdk', 'x402', 'react', 'better-auth'];

  console.log('\n🚀 Publishing packages...');
  for (const name of publicPackages) {
    const pkgPath = join(rootDir, 'packages', name);
    const pkgJson = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'));

    if (pkgJson.private) {
      console.log(`  ⏭️  Skipping ${pkgJson.name} (private)`);
      continue;
    }

    console.log(`  📤 Publishing ${pkgJson.name}@${version}...`);
    run('pnpm publish --access public --no-git-checks', { cwd: pkgPath });
  }

  // 6. Push to git
  console.log('\n📤 Pushing to git...');
  run('git push && git push --tags');

  console.log(`\n✅ Released v${version} successfully!`);
} catch (err) {
  console.error('\n❌ Release failed:', err.message);
  process.exit(1);
}
