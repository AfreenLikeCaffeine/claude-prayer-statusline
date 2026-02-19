#!/usr/bin/env node
/**
 * setup.js — installer for prayer-time-addon
 *
 * Usage:
 *   node setup.js            # install
 *   node setup.js --uninstall  # restore previous settings
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeDir = path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');
const addonSrc = path.join(__dirname, 'prayer-time-addon.js');
const addonDest = path.join(claudeDir, 'prayer-time-addon.js');

// Normalize path for the command string (use forward slashes, quote it)
function cmdPath(p) {
  return `"${p.split(path.sep).join('/')}"`;
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

// ---- Uninstall ----
if (process.argv.includes('--uninstall')) {
  const settings = readSettings();

  if (!settings._prayerAddonPreviousStatusLine && !settings.statusLine) {
    console.log('Prayer time addon is not installed.');
    process.exit(0);
  }

  if (settings._prayerAddonPreviousStatusLine) {
    settings.statusLine = settings._prayerAddonPreviousStatusLine;
    delete settings._prayerAddonPreviousStatusLine;
  } else {
    delete settings.statusLine;
  }

  writeSettings(settings);

  // Remove the copied addon file
  try { fs.unlinkSync(addonDest); } catch {}

  console.log('Prayer time addon uninstalled.');
  console.log('Restart Claude Code to apply.');
  process.exit(0);
}

// ---- Install ----

// 1. Copy prayer-time-addon.js to ~/.claude/
if (!fs.existsSync(addonSrc)) {
  console.error('Error: prayer-time-addon.js not found next to setup.js.');
  console.error('Please run setup.js from the repo directory.');
  process.exit(1);
}

fs.mkdirSync(claudeDir, { recursive: true });
fs.copyFileSync(addonSrc, addonDest);

// 2. Read existing settings
const settings = readSettings();

// 3. Merge statusLine
const existing = settings.statusLine;
const addonCommand = `node ${cmdPath(addonDest)}`;

if (existing && existing.command) {
  // Already wrapping — avoid double-wrapping
  if (existing.command.includes('prayer-time-addon.js')) {
    console.log('Prayer time addon is already installed.');
    process.exit(0);
  }
  // Wrap the existing command
  settings._prayerAddonPreviousStatusLine = existing;
  settings.statusLine = {
    type: 'command',
    command: `${addonCommand} -- ${existing.command}`,
  };
} else {
  // No existing statusline — use addon as the sole statusline
  if (existing) settings._prayerAddonPreviousStatusLine = existing;
  settings.statusLine = {
    type: 'command',
    command: addonCommand,
  };
}

// 4. Write settings
writeSettings(settings);

console.log('Prayer time addon installed!');
console.log('Restart Claude Code to see your prayer times.');
