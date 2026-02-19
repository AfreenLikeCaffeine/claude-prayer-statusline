# prayer-time-addon

A [Claude Code](https://claude.ai/claude-code) status line add-on that shows your next Islamic prayer time as a countdown — right in your terminal.

```
main  |  Context remaining: 82%  |  $0.0031
Dhuhr in 1h 23m (Seattle)
```

Works with any existing status line setup. Zero npm dependencies. Auto-detects your location.

---

## Install

```bash
git clone https://github.com/afree/claude-prayer-statusline
cd claude-prayer-statusline
node setup.js
```

Restart Claude Code — that's it.

## Uninstall

```bash
node setup.js --uninstall
```

Restores your previous status line configuration.

---

## How it works

1. **Location**: Your city is looked up once via [ip-api.com](http://ip-api.com) (free, no API key, no account needed). One HTTP request, nothing stored externally.
2. **Prayer times**: Calculated locally in pure JavaScript using the **ISNA method** (Fajr and Isha at 15°). No external prayer time API.
3. **Caching**: Location and prayer times are cached for 1 hour in `~/.claude/prayer-time-addon-cache.json`. Safe to delete at any time.
4. **Wrapping**: If you already have a custom status line, `setup.js` wraps it — your existing lines stay, and the prayer line is appended below.

---

## Requirements

- [Claude Code](https://claude.ai/claude-code)
- Node.js (any modern version — no `npm install` needed)

---

## Prayer method

Uses the **ISNA (Islamic Society of North America)** method: Fajr and Isha calculated at 15° below the horizon. The Shafi shadow ratio (1x) is used for Asr.

To use a different calculation method, edit the angle values near the top of `prayer-time-addon.js`:

```js
const fajrAngle  = 15;  // degrees below horizon
const ishaAngle  = 15;  // degrees below horizon
```

---

## Notes

- At extreme latitudes in winter (e.g., above ~60°N), some prayers may not be calculable. The addon silently skips the prayer line in those cases rather than showing an error.
- The model pricing table in the base status line is separate from this addon and may need periodic updates as Anthropic releases new models.
