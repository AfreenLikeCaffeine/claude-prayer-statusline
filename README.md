# ﷽ claude-prayer-statusline

**Never let Salah slip by in the flow state.** This Claude Code add-on shows your next prayer and how long you have — quietly, in your status bar, all the time.

```
Dhuhr in 1h 23m (Seattle)
```

Zero dependencies. One-time location setup. Works with any existing status line.

---

## Install

```bash
git clone https://github.com/AfreenLikeCaffeine/claude-prayer-statusline
cd claude-prayer-statusline
node setup.js
```

Setup will ask for your city once and save it. Restart Claude Code — your prayer countdown will appear on the next line of your status bar.

### Update your location

```bash
node setup.js --location
```

## Uninstall

```bash
node setup.js --uninstall
```

Restores your previous status line configuration.

---

## How it works

- **Location**: Entered once during `node setup.js` and stored in `~/.claude/prayer-time-addon-config.json`. Geocoded via [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) (free, no API key). Update anytime with `node setup.js --location`.
- **Prayer times**: Calculated on-device in pure JavaScript using the **ISNA method** (Fajr and Isha at 15°). No external prayer API. Times are cached for 1 hour — no repeated lookups.
- **Wrapping**: Already have a custom status line? `setup.js` wraps it — your existing lines stay, the prayer countdown appears below.

---

## Requirements

- [Claude Code](https://claude.ai/claude-code)
- Node.js (any modern version — no `npm install` needed)

---

## Prayer method

Uses **ISNA** (Islamic Society of North America): Fajr and Isha at 15° below the horizon, Asr using the standard shadow ratio.

---

**Built with Tawakkul. Shipped with Bismillah. ﷽**
