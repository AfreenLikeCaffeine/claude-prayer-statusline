# ﷽ claude-prayer-statusline

**Never let Salah slip by in the flow state.** This Claude Code add-on shows your next prayer and how long you have — quietly, in your status bar, all the time.

```
Dhuhr in 1h 23m (Seattle)
```

Zero dependencies. Auto-detects your location. Works with any existing status line.

---

## Install

```bash
git clone https://github.com/AfreenLikeCaffeine/claude-prayer-statusline
cd claude-prayer-statusline
node setup.js
```

Restart Claude Code. Your prayer countdown will appear on the next line of your status bar.

## Uninstall

```bash
node setup.js --uninstall
```

Restores your previous status line configuration.

---

## How it works

- **Location**: Detected once via [ip-api.com](http://ip-api.com) (free, no API key, no account). Cached locally for 1 hour.
- **Prayer times**: Calculated on-device in pure JavaScript using the **ISNA method** (Fajr and Isha at 15°). No external prayer API, no internet required after the first geolocation request.
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
