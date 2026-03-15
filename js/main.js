/**
 * CATAN — entry point and UI wiring.
 */

import { createGame } from './game.js';
import { renderBoard } from './render.js';

const game = createGame(2);
const { state } = game;

const el = (id) => document.getElementById(id);
const boardEl = el('board');
const gameStatus = el('gameStatus');
const rollDiceBtn = el('rollDice');
const die1El = el('die1');
const die2El = el('die2');
const logEntries = el('logEntries');

function updateStatus() {
  const cp = game.currentPlayer();
  const winner = game.getWinner();
  if (winner !== null) {
    gameStatus.textContent = `Player ${winner + 1} wins with ${cp.victoryPoints} victory points!`;
    return;
  }
  if (state.phase === 'setup') {
    gameStatus.textContent = `Player ${state.currentPlayerIndex + 1}: place settlement (round ${state.setupRound})`;
  } else if (state.phase === 'setup_road') {
    gameStatus.textContent = `Player ${state.currentPlayerIndex + 1}: place a road`;
  } else if (state.phase === 'setup2') {
    gameStatus.textContent = `Player ${state.currentPlayerIndex + 1}: place 2nd settlement`;
  } else {
    const rollText = state.diceRoll
      ? state.diceRoll.isSeven
        ? '7 — move the robber!'
        : `Rolled ${state.diceRoll.d1 + state.diceRoll.d2}`
      : '';
    gameStatus.textContent = `Player ${state.currentPlayerIndex + 1}'s turn. ${rollText}`;
  }
}

function updateResources() {
  const cp = game.currentPlayer();
  el('resWood').textContent = cp.resources.wood ?? 0;
  el('resBrick').textContent = cp.resources.brick ?? 0;
  el('resSheep').textContent = cp.resources.sheep ?? 0;
  el('resWheat').textContent = cp.resources.wheat ?? 0;
  el('resOre').textContent = cp.resources.ore ?? 0;
}

function updateDice() {
  if (state.diceRoll) {
    die1El.textContent = state.diceRoll.d1;
    die2El.textContent = state.diceRoll.d2;
  } else {
    die1El.textContent = '–';
    die2El.textContent = '–';
  }
  const canRoll =
    state.phase === 'play' &&
    state.diceRoll === null &&
    game.getWinner() === null;
  rollDiceBtn.disabled = !canRoll;
}

function updateBuildButtons() {
  const playing = state.phase === 'play' && game.getWinner() === null;
  el('buildRoad').disabled = !game.canBuildRoad();
  el('buildSettlement').disabled = !game.canBuildSettlement();
  el('buildCity').disabled = !game.canBuildCity();
  el('buyDevCard').disabled =
    !playing || state.diceRoll === null || !game.canAfford(game.currentPlayer().resources, { sheep: 1, wheat: 1, ore: 1 });
}

function updatePlayersList() {
  const ul = el('players');
  ul.innerHTML = state.players
    .map(
      (p) =>
        `<li class="${p.id === state.currentPlayerIndex ? 'active' : ''}">
          <span class="player-dot" style="background:${['#c0392b','#2980b9','#27ae60','#f39c12'][p.id]}"></span>
          Player ${p.id + 1}: ${p.victoryPoints} VP
        </li>`
    )
    .join('');
}

function log(msg) {
  const p = document.createElement('p');
  p.textContent = msg;
  logEntries.insertBefore(p, logEntries.firstChild);
}

function refresh() {
  renderBoard(game, boardEl);
  updateStatus();
  updateResources();
  updateDice();
  updateBuildButtons();
  updatePlayersList();
  updateEndTurnButton();
}

// Roll dice
rollDiceBtn.addEventListener('click', () => {
  if (state.phase !== 'play' || state.diceRoll !== null) return;
  const roll = game.rollDice();
  log(
    `Player ${state.currentPlayerIndex + 1} rolled ${roll.d1 + roll.d2}${roll.isSeven ? ' (7 — robber!)' : ''}`
  );
  refresh();
});

// Board clicks: vertex (settlement/city) or edge (road)
boardEl.addEventListener('click', (e) => {
  const vertexKey = e.target.closest('[data-vertex]')?.getAttribute('data-vertex');
  const edgeKey = e.target.closest('[data-edge]')?.getAttribute('data-edge');
  if (vertexKey) {
    const hasCity = state.players.some((p) => p.cities.includes(vertexKey));
    const hasSettlement = state.players.some((p) => p.settlements.includes(vertexKey));
    const cp = game.currentPlayer();
    if (hasCity) return;
    if (hasSettlement) {
      if (state.phase === 'play' && cp.settlements.includes(vertexKey) && game.canBuildCity()) {
        game.placeCity(vertexKey);
        log(`Player ${state.currentPlayerIndex + 1} built a city`);
        refresh();
      }
      return;
    }
    if (game.placeSettlement(vertexKey)) {
      const phase = state.phase;
      if (phase === 'setup' || phase === 'setup2') {
        log(`Player ${state.currentPlayerIndex + 1} placed settlement`);
      } else {
        log(`Player ${state.currentPlayerIndex + 1} built a settlement`);
      }
      refresh();
    }
  }
  if (edgeKey) {
    if (game.placeRoad(edgeKey)) {
      if (state.phase === 'setup2') {
        log(`Player ${state.currentPlayerIndex + 1} placed road`);
      } else if (state.phase === 'play') {
        log(`Player ${state.currentPlayerIndex + 1} built a road`);
      }
      refresh();
    }
  }
});

// Build buttons (optional: they just enable placement on board; we already handle board clicks)
el('buildRoad').addEventListener('click', () => {});
el('buildSettlement').addEventListener('click', () => {});
el('buildCity').addEventListener('click', () => {});

// End turn (when in play and dice were rolled)
function endTurn() {
  if (state.phase !== 'play' || state.diceRoll === null) return;
  game.nextTurn();
  log(`Player ${state.currentPlayerIndex + 1}'s turn`);
  refresh();
}

// Add end turn button
const header = document.querySelector('.game-header');
const endTurnBtn = document.createElement('button');
endTurnBtn.type = 'button';
endTurnBtn.className = 'dice-btn';
endTurnBtn.textContent = 'End turn';
endTurnBtn.id = 'endTurn';
endTurnBtn.addEventListener('click', endTurn);
header.appendChild(endTurnBtn);

function updateEndTurnButton() {
  const show =
    state.phase === 'play' &&
    state.diceRoll !== null &&
    game.getWinner() === null;
  endTurnBtn.style.display = show ? 'block' : 'none';
  endTurnBtn.disabled = !show;
}

// Initial render
refresh();
log('Place your initial settlements, then roads. Then roll the dice!');
