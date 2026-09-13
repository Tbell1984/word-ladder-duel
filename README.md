# 🪜 Word Ladder Duel

A browser-based word ladder puzzle game. Turn a start word into a target word by changing one letter at a time — every step along the way must be a real word.

## Play

Open [`index.html`](index.html) in a browser. No build step or server required.

## Modes

- **Daily** — everyone gets the same puzzle for the day (seeded by date), for 4- or 5-letter words. Solve it once per day to keep your streak going.
- **Practice** — generates a new random puzzle on demand via the **New** button.

## Features

- Hints (suggests the next word along a shortest path to the target)
- Undo
- Move counter, timer, and par comparison against the optimal solve
- Daily streak tracking (stored in `localStorage`)
- Shareable result summary (copy to clipboard)

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `style.css` | Styling |
| `wordlist.js` | Raw 4- and 5-letter word lists |
| `script.js` | Game logic: dictionary/graph setup, puzzle generation, and UI wiring |

## How puzzles are generated

Words of the same length are linked into a graph where two words are neighbors if they differ by exactly one letter. A start word is picked at random, then a target is chosen among words reachable in 3–7 steps (via breadth-first search), so puzzles are solvable and reasonably challenging.
