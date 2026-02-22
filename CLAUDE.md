# Claude Code Instructions

## Cache versioning

`CACHE_VERSION` in `prayer-time-addon.js` **must be bumped** whenever:
- Prayer time calculation logic changes
- The cache data structure changes
- The location source changes (e.g., IP → config file)

Bumping the version auto-invalidates all users' stale caches on the next run.
Current version: `3`
