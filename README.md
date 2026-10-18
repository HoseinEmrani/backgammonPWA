# Backgammon PWA

Two-player, offline backgammon with a skeuomorphic wood-and-felt board, 3D dice, a doubling cube, turn timer and resign option. Built for iPad (landscape), no build step, no dependencies.

**Play:** https://hoseinemrani.github.io/backgammonPWA/ — on iPad open in Safari → Share → Add to Home Screen. It works offline after the first load.

## Run locally
```bash
python3 -m http.server 8123   # then open http://localhost:8123
node test-engine.js           # rules tests
```

## License
[PolyForm Noncommercial 1.0.0](LICENSE): free to use, modify and share for any non-commercial purpose; commercial use is not permitted.

## Analytics (optional)
Privacy-friendly, cookie-free [GoatCounter](https://www.goatcounter.com) (free for non-commercial use). Create a site, then set `ANALYTICS.goatcounter` in `app.js` to your site code. Tracked: page loads, installed-vs-browser launches, layout, and per finished game: result type (single/gammon/backgammon/resigned/double-passed), game length bucket, cube value, match finished. Events queue offline and send when back online. No names or move data are sent.
