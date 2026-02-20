#!/usr/bin/env node
/**
 * prayer-time-addon.js
 *
 * A Claude Code status line add-on that appends a prayer time countdown
 * to any existing status line (or runs standalone).
 *
 * Works with any existing statusLine.command — wraps it and adds a
 * green prayer countdown line below.
 *
 * Location is auto-detected via ip-api.com (free, no key required).
 * Prayer times are calculated in pure JS using the ISNA method.
 * Location + prayer times are cached for 1 hour in
 * ~/.claude/prayer-time-addon-cache.json
 *
 * Usage (standalone):
 *   node prayer-time-addon.js
 *
 * Usage (wrapping an existing statusline):
 *   node prayer-time-addon.js -- node /path/to/your/statusline.js
 */

'use strict';

const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// ANSI colors
// ---------------------------------------------------------------------------
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
};

// ---------------------------------------------------------------------------
// Location + prayer time cache
// ---------------------------------------------------------------------------
const CACHE_FILE = path.join(os.homedir(), '.claude', 'prayer-time-addon-cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_VERSION = 2; // bump when calculation logic changes to auto-invalidate stale caches

function readCache() {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (data.version !== CACHE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // non-critical
  }
}

// ---------------------------------------------------------------------------
// IP geolocation (ip-api.com — free, no key, ~150ms)
// ---------------------------------------------------------------------------
function fetchLocation() {
  return new Promise((resolve) => {
    const req = http.get('http://ip-api.com/json/?fields=lat,lon,city,timezone', (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve({ lat: j.lat, lon: j.lon, city: j.city, timezone: j.timezone });
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
  });
}

// ---------------------------------------------------------------------------
// ISNA prayer time calculation (pure JS, no dependencies)
// Based on the formulas from praytimes.org
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

function julianDay(date) {
  const Y = date.getFullYear();
  const M = date.getMonth() + 1;
  const D = date.getDate();
  const A = Math.floor((14 - M) / 12);
  const y = Y + 4800 - A;
  const m = M + 12 * A - 3;
  return D + Math.floor((153 * m + 2) / 5) + 365 * y +
    Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * D) * DEG;
  const q = (280.459 + 0.98564736 * D) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const e = (23.439 - 0.00000036 * D) * DEG;
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / DEG / 15;
  const sinDec = Math.sin(e) * Math.sin(L);
  const dec = Math.asin(sinDec);
  const EqT = q / 15 - ((RA + 360) % 24);
  return { dec, EqT };
}

// angle = degrees below horizon (positive = below). For Asr, pass negative (sun is above horizon).
function hourAngle(angle, lat, dec) {
  const num = -Math.sin(angle * DEG) - Math.sin(lat * DEG) * Math.sin(dec);
  const den = Math.cos(lat * DEG) * Math.cos(dec);
  if (Math.abs(den) < 1e-10) return null;
  const val = num / den;
  if (val < -1 || val > 1) return null;
  return Math.acos(val) / DEG / 15;
}

/**
 * Calculate ISNA prayer times for a given date and location.
 * Returns an object with prayer times as fractional UTC hours (0-24).
 */
function calcPrayerTimesUTC(date, lat, lon) {
  const jd = julianDay(date);
  const { dec, EqT } = sunPosition(jd);

  const lonOffset = lon / 15;
  const noon = 12 - EqT;

  function prayerTime(angle, direction) {
    const ha = hourAngle(angle, lat, dec);
    if (ha === null) return null;
    return noon + (direction === 'before' ? -ha : ha);
  }

  // ISNA: Fajr = 15°, Isha = 15°
  const fajrSolar    = prayerTime(15, 'before');
  const sunriseSolar = prayerTime(0.833, 'before');
  const dhuhrSolar   = noon;
  const asrSolar     = (() => {
    // shadowAngle is the sun's altitude at Asr — negative means above horizon in our convention
    const shadowAngle = Math.atan(1 / (1 + Math.tan(Math.abs(lat * DEG - dec)))) / DEG;
    return prayerTime(-shadowAngle, 'after');
  })();
  const maghribSolar = prayerTime(0.833, 'after');
  const ishaSolar    = prayerTime(15, 'after');

  function toUTC(t) {
    return t === null ? null : t - lonOffset;
  }

  return {
    Fajr:    toUTC(fajrSolar),
    Sunrise: toUTC(sunriseSolar),
    Dhuhr:   toUTC(dhuhrSolar),
    Asr:     toUTC(asrSolar),
    Maghrib: toUTC(maghribSolar),
    Isha:    toUTC(ishaSolar),
  };
}

/**
 * Given UTC prayer times and current UTC time (fractional hours),
 * return the next prayer name and minutes remaining.
 */
function nextPrayer(prayerTimesUTC, nowUTC) {
  const names = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const now = ((nowUTC % 24) + 24) % 24;

  for (const name of names) {
    const t = prayerTimesUTC[name];
    if (t === null) continue;
    const pt = ((t % 24) + 24) % 24;
    if (pt > now) {
      return { name, minutesLeft: Math.round((pt - now) * 60) };
    }
  }

  // All prayers passed — next is Fajr tomorrow
  const fajr = prayerTimesUTC['Fajr'];
  if (fajr !== null) {
    const pt = ((fajr % 24) + 24) % 24;
    return { name: 'Fajr (tomorrow)', minutesLeft: Math.round(((pt + 24) - now) * 60) };
  }

  return null;
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Spawn an existing statusline command and capture its output
// ---------------------------------------------------------------------------
function runExistingStatusline(cmdParts, stdinData) {
  return new Promise((resolve) => {
    const [cmd, ...args] = cmdParts;
    let output = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    } catch {
      return resolve('');
    }
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', () => {}); // swallow stderr
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(output));
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(output); }, 5000);
    child.on('close', () => clearTimeout(timer));
    try {
      child.stdin.write(stdinData);
      child.stdin.end();
    } catch {
      resolve('');
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Read JSON context from stdin (Claude Code sends this)
  const stdinData = await new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => { raw += d; });
    process.stdin.on('end', () => resolve(raw || '{}'));
    process.stdin.on('error', () => resolve('{}'));
    setTimeout(() => resolve(raw || '{}'), 3000);
  });

  // Check for existing statusline command passed after --
  const doubleDashIdx = process.argv.indexOf('--');
  const existingCmd = doubleDashIdx >= 0 ? process.argv.slice(doubleDashIdx + 1) : [];

  // Run existing statusline if present
  let existingOutput = '';
  if (existingCmd.length > 0) {
    existingOutput = await runExistingStatusline(existingCmd, stdinData);
  }

  // Calculate prayer line
  let prayerLine = '';
  try {
    let locationData = null;
    let prayerTimesUTC = null;

    const cache = readCache();
    const now = Date.now();

    if (cache && cache.timestamp && (now - cache.timestamp) < CACHE_TTL_MS &&
        cache.location && cache.prayerTimesUTC) {
      locationData = cache.location;
      prayerTimesUTC = cache.prayerTimesUTC;
    } else {
      locationData = await fetchLocation();
      if (locationData) {
        prayerTimesUTC = calcPrayerTimesUTC(new Date(), locationData.lat, locationData.lon);
        writeCache({ version: CACHE_VERSION, timestamp: now, location: locationData, prayerTimesUTC });
      }
    }

    if (prayerTimesUTC) {
      const nowDate = new Date();
      const nowUTC = nowDate.getUTCHours() + nowDate.getUTCMinutes() / 60 + nowDate.getUTCSeconds() / 3600;
      const next = nextPrayer(prayerTimesUTC, nowUTC);
      if (next) {
        const city = locationData?.city ? ` (${locationData.city})` : '';
        prayerLine = `${C.green}${next.name} in ${formatMinutes(next.minutesLeft)}${city}${C.reset}\n`;
      }
    }
  } catch {
    // Prayer line is optional — never crash
  }

  // Output: existing lines first, then prayer line
  if (existingOutput) process.stdout.write(existingOutput);
  if (prayerLine) process.stdout.write(prayerLine);
}

main().catch(() => {});
