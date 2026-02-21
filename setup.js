#!/usr/bin/env node
/**
 * setup.js — installer for prayer-time-addon
 *
 * Usage:
 *   node setup.js              # install (copies addon + prompts for location)
 *   node setup.js --location   # update your saved location only
 *   node setup.js --uninstall  # restore previous settings
 */

'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const os = require('os');
const readline = require('readline');

const claudeDir = path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');
const addonSrc = path.join(__dirname, 'prayer-time-addon.js');
const addonDest = path.join(claudeDir, 'prayer-time-addon.js');
const configPath = path.join(claudeDir, 'prayer-time-addon-config.json');
const cachePath = path.join(claudeDir, 'prayer-time-addon-cache.json');

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

// ---- Prompt helper ----
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// ---- Geocode a city query using OpenStreetMap Nominatim ----
function geocode(query) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
    const req = https.get(url, { headers: { 'User-Agent': 'prayer-time-addon/1.0' } }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try {
          const results = JSON.parse(body);
          if (!results.length) return resolve(null);
          const r = results[0];
          const lat = parseFloat(r.lat);
          const lon = parseFloat(r.lon);
          const addr = r.address || {};
          const city = addr.city || addr.town || addr.village || addr.county || r.display_name.split(',')[0].trim();
          const displayName = r.display_name.length > 80
            ? r.display_name.substring(0, 77) + '...'
            : r.display_name;
          resolve({ lat, lon, city, displayName });
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

// ---- Interactive location setup ----
async function setupLocation() {
  // Check for existing config
  let existingConfig = null;
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (typeof data.lat === 'number' && typeof data.lon === 'number') existingConfig = data;
  } catch {}

  if (existingConfig && existingConfig.city) {
    const answer = await prompt(`\nLocation already set to "${existingConfig.city}". Update it? (y/N): `);
    if (answer.trim().toLowerCase() !== 'y') {
      console.log(`Using existing location: ${existingConfig.city}`);
      return;
    }
  }

  console.log('\nPrayer times need your location to be accurate.');
  const input = await prompt('Enter your city (e.g. Dallas TX, London UK, Karachi Pakistan): ');
  if (!input.trim()) {
    console.log('No location entered. Run "node setup.js --location" to configure later.');
    return;
  }

  process.stdout.write('Looking up location...');
  const result = await geocode(input.trim());
  process.stdout.write('\r' + ' '.repeat(40) + '\r'); // clear the line

  if (!result) {
    console.log('Could not find that location. Run "node setup.js --location" to try again.');
    return;
  }

  const confirm = await prompt(`Found: ${result.displayName}\nUse this location? (Y/n): `);
  if (confirm.trim().toLowerCase() === 'n') {
    console.log('Location not saved. Run "node setup.js --location" to try again.');
    return;
  }

  // Use the machine's local timezone (the addon doesn't use this in calculations,
  // but store it for potential future use)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  fs.writeFileSync(configPath, JSON.stringify({ lat: result.lat, lon: result.lon, city: result.city, timezone }, null, 2) + '\n', 'utf8');

  // Invalidate prayer time cache so it recalculates with the new location
  try { fs.unlinkSync(cachePath); } catch {}

  console.log(`Location saved: ${result.city}`);
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
  console.log('Your location config (~/.claude/prayer-time-addon-config.json) was kept.');
  console.log('Restart Claude Code to apply.');
  process.exit(0);
}

// ---- Update location only ----
if (process.argv.includes('--location')) {
  setupLocation().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  return;
}

// ---- Install ----
async function install() {
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
    } else {
      // Wrap the existing command
      settings._prayerAddonPreviousStatusLine = existing;
      settings.statusLine = {
        type: 'command',
        command: `${addonCommand} -- ${existing.command}`,
      };
      writeSettings(settings);
    }
  } else {
    // No existing statusline — use addon as the sole statusline
    if (existing) settings._prayerAddonPreviousStatusLine = existing;
    settings.statusLine = {
      type: 'command',
      command: addonCommand,
    };
    writeSettings(settings);
  }

  // 4. Prompt for location
  await setupLocation();

  console.log('\nPrayer time addon installed!');
  console.log('Restart Claude Code to see your prayer times.');
}

install().catch(e => { console.error(e); process.exit(1); });
