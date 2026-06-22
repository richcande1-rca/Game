# Orbit

A rough phone-friendly arcade prototype.

## Goal

Cross the orbit rings without crashing.

- Tap to jump outward one ring.
- Avoid glowing debris moving around each orbit.
- Reach the outside to score.
- Grab stars for bonus points.
- Each successful crossing makes the universe a little meaner.

## Controls

- Phone/tablet: tap anywhere
- Desktop: click, tap, or press Space

## Files

- `index.html` — page shell
- `style.css` — full-screen mobile layout
- `game.js` — canvas game loop

## Current rough-draft rules

1. Start on the inner orbit.
2. Tap outward ring by ring.
3. If you hit debris, you lose a life and reset to the inner orbit.
4. If you clear the outer ring, you score and the speed increases.
5. Three crashes ends the run.

This is intentionally simple: circular Frogger with a gorgeous starry background.