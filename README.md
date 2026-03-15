# CATAN

A web version of Settlers of Catan. Play locally in the browser with 2 players (hot-seat).

## How to play

1. **Setup**: Each player places one settlement, then one road (round 1). Then again in the same order (round 2). You receive starting resources from the hexes around your second settlement.
2. **Play**: On your turn, roll the dice. If you roll 7, the robber is activated (move it in a future version). Otherwise, all players receive resources from hexes with that number that touch their settlements (1 per settlement, 2 per city).
3. Build **roads** (1 wood + 1 brick), **settlements** (1 wood, brick, sheep, wheat), and **cities** (2 wheat + 3 ore) by clicking valid highlighted spots on the board. Upgrade a settlement to a city by clicking it when you have the resources.
4. **End turn** when done. First to **10 victory points** wins (settlements = 1 VP, cities = 2 VP).

## Run locally

ES modules require a local server. From the project root:

```bash
npm install
npm run dev
```

Then open **http://localhost:3000** in your browser. If you don’t have Node, you can use any static file server that serves the project directory (e.g. Python: `python -m http.server 8000`).
