# Galactic Settlers (Star Wars Catan)

A Star Wars–themed web version of Settlers of Catan. Play locally in the browser with 2 players (hot-seat).

## How to play

1. **Setup**
   - **Round 1:** Each faction (in order) places one **outpost**, then one **hyperlane** from that outpost.
   - **Round 2 (reverse order):** The last faction goes first. Each places a second outpost (must touch one of their hyperlanes), then a second hyperlane. You receive starting resources from the hexes around your **second** outpost.
2. **Play:** On your turn, **Roll** the dice. On a 7, the smuggler is activated (move coming in a future version). Otherwise, all factions receive resources from hexes with that number next to their outposts/cities (1 per outpost, 2 per city).
3. **Build** by clicking **highlighted** spots on the board:
   - **Hyperlane** — 1 timber + 1 alloy
   - **Outpost** — 1 timber, 1 alloy, 1 provisions, 1 rations (must touch your hyperlane, not next to another building)
   - **City** — upgrade an outpost: 2 rations + 3 ore
4. Click **End turn** when done. First to **10 victory points** wins (outpost = 1 VP, city = 2 VP).

## Run locally

ES modules require a local server. From the project root:

```bash
npm install
npm run dev
```

Then open **http://localhost:3000** in your browser.
