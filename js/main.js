/**
 * Galactic Settlers — entry point and UI wiring.
 */

import { createGame, RESOURCES } from './game.js';
import { renderBoard } from './render.js';

const game = createGame(2);
const { state } = game;

let discardSelection = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };

const el = (id) => document.getElementById(id);
const boardEl = el('board');
const gameStatus = el('gameStatus');
const rollDiceBtn = el('rollDice');
const die1El = el('die1');
const die2El = el('die2');
const logEntries = el('logEntries');
const endTurnBtn = el('endTurn');

const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00'];

const DEV_MODE_KEY = 'catan_dev_mode';
function isDevMode() {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEV_MODE_KEY) === '1') return true;
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') !== null) return true;
  } catch (_) {}
  return false;
}
function setDevMode(on) {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(DEV_MODE_KEY, on ? '1' : '0');
  } catch (_) {}
}

function playerName(i) {
  return `Faction ${i + 1}`;
}

function updateStatus() {
  const cp = game.currentPlayer();
  const winner = game.getWinner();
  if (winner !== null) {
    const vp = game.getTotalVictoryPoints(state.players[winner]);
    gameStatus.textContent = `${playerName(winner)} wins with ${vp} victory points!`;
    return;
  }
  if (state.phase === 'setup') {
    gameStatus.textContent = `${playerName(state.currentPlayerIndex)}: place 1st outpost (round ${state.setupRound})`;
  } else if (state.phase === 'setup_road') {
    gameStatus.textContent = `${playerName(state.currentPlayerIndex)}: place hyperlane`;
  } else if (state.phase === 'setup2') {
    gameStatus.textContent = `${playerName(state.currentPlayerIndex)}: place 2nd outpost`;
  } else if (state.sevenPhase === 'discard' && state.discardQueue.length > 0) {
    const { playerId, count } = state.discardQueue[0];
    gameStatus.textContent = `${playerName(playerId)}: discard ${count} cards (7 rolled)`;
  } else if (state.sevenPhase === 'move_robber' || state.mustMoveRobber) {
    gameStatus.textContent = `${playerName(state.currentPlayerIndex)}: move the smuggler`;
  } else if (state.pendingStealTargets && state.pendingStealTargets.length > 0) {
    gameStatus.textContent = `${playerName(state.currentPlayerIndex)}: choose who to steal from`;
  } else if (state.monopolyResource === 'pending') {
    gameStatus.textContent = `${playerName(state.currentPlayerIndex)}: choose resource (Monopoly)`;
  } else if (state.yearOfPlentyLeft > 0) {
    gameStatus.textContent = `${playerName(state.currentPlayerIndex)}: take ${state.yearOfPlentyLeft} resource(s) (Year of Plenty)`;
  } else {
    const rollText = state.diceRoll
      ? state.diceRoll.isSeven
        ? '7 — discard then move smuggler'
        : `Rolled ${state.diceRoll.d1 + state.diceRoll.d2}`
      : 'Roll to begin.';
    gameStatus.textContent = `${playerName(state.currentPlayerIndex)}'s turn. ${rollText}`;
  }
}

function updateResources() {
  const container = el('resourcesContainer');
  const dev = isDevMode();
  if (dev) {
    container.innerHTML = state.players
      .map(
        (p) => `
        <div class="faction-resources ${p.id === state.currentPlayerIndex ? 'current' : ''}" data-faction="${p.id}">
          <div class="faction-resources-title">
            <span class="player-dot" style="background:${PLAYER_COLORS[p.id]}"></span>
            ${playerName(p.id)}
          </div>
          <ul class="resource-list">
            <li><span class="res-icon-wrap res-wood"><svg><use href="#icon-wood"/></svg></span> <span>${p.resources.wood ?? 0}</span></li>
            <li><span class="res-icon-wrap res-brick"><svg><use href="#icon-brick"/></svg></span> <span>${p.resources.brick ?? 0}</span></li>
            <li><span class="res-icon-wrap res-sheep"><svg><use href="#icon-sheep"/></svg></span> <span>${p.resources.sheep ?? 0}</span></li>
            <li><span class="res-icon-wrap res-wheat"><svg><use href="#icon-wheat"/></svg></span> <span>${p.resources.wheat ?? 0}</span></li>
            <li><span class="res-icon-wrap res-ore"><svg><use href="#icon-ore"/></svg></span> <span>${p.resources.ore ?? 0}</span></li>
          </ul>
        </div>`
      )
      .join('');
  } else {
    container.innerHTML = `
      <ul class="resource-list" id="resourceListCurrent">
        <li><span class="res-icon-wrap res-wood" title="Timber"><svg><use href="#icon-wood"/></svg></span> <span id="resWood">0</span></li>
        <li><span class="res-icon-wrap res-brick" title="Alloy"><svg><use href="#icon-brick"/></svg></span> <span id="resBrick">0</span></li>
        <li><span class="res-icon-wrap res-sheep" title="Provisions"><svg><use href="#icon-sheep"/></svg></span> <span id="resSheep">0</span></li>
        <li><span class="res-icon-wrap res-wheat" title="Rations"><svg><use href="#icon-wheat"/></svg></span> <span id="resWheat">0</span></li>
        <li><span class="res-icon-wrap res-ore" title="Ore"><svg><use href="#icon-ore"/></svg></span> <span id="resOre">0</span></li>
      </ul>`;
    const cp = game.currentPlayer();
    el('resWood').textContent = cp.resources.wood ?? 0;
    el('resBrick').textContent = cp.resources.brick ?? 0;
    el('resSheep').textContent = cp.resources.sheep ?? 0;
    el('resWheat').textContent = cp.resources.wheat ?? 0;
    el('resOre').textContent = cp.resources.ore ?? 0;
  }
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
  const blocked = state.sevenPhase !== null || state.mustMoveRobber || (state.pendingStealTargets && state.pendingStealTargets.length > 0);
  el('buildRoad').disabled = blocked || !game.canBuildRoad();
  el('buildSettlement').disabled = blocked || !game.canBuildSettlement();
  el('buildCity').disabled = blocked || !game.canBuildCity();
  const canBuyDev =
    state.phase === 'play' &&
    state.diceRoll !== null &&
    game.getWinner() === null &&
    !blocked &&
    state.devDeck.length > 0 &&
    game.canAfford(game.currentPlayer().resources, { sheep: 1, wheat: 1, ore: 1 });
  el('buyDevCard').disabled = !canBuyDev;
}

function updatePlayersList() {
  const ul = el('players');
  ul.innerHTML = state.players
    .map(
      (p) =>
        `<li class="${p.id === state.currentPlayerIndex ? 'active' : ''}">
          <span class="player-dot" style="background:${PLAYER_COLORS[p.id % PLAYER_COLORS.length]}"></span>
          ${playerName(p.id)}: ${game.getTotalVictoryPoints(p)} VP
        </li>`
    )
    .join('');
}

function updateCardPhaseContainer() {
  const container = el('cardPhaseContainer');
  if (!container) return;
  if (state.sevenPhase === 'discard' && state.discardQueue.length > 0) {
    const { playerId, count } = state.discardQueue[0];
    const p = state.players[playerId].resources;
    const totalSelected = RESOURCES.reduce((s, r) => s + (discardSelection[r] || 0), 0);
    let html = `<div class="phase-title">${playerName(playerId)}: discard ${count} cards</div><div class="discard-row">`;
    RESOURCES.forEach((r) => {
      const have = p[r] || 0;
      const sel = discardSelection[r] || 0;
      if (have > 0) {
        html += `<button type="button" class="btn btn-sm res-btn" data-res="${r}" data-action="add" ${sel >= have ? 'disabled' : ''}>+</button>`;
        html += `<span class="res-label">${r}: ${sel}/${have}</span> `;
      }
    });
    html += `</div><div class="discard-row">Selected: ${totalSelected}/${count}</div>`;
    if (totalSelected === count) {
      html += `<button type="button" class="btn btn-sm" id="confirmDiscard">Confirm discard</button>`;
    } else {
      html += `<button type="button" class="btn btn-sm res-btn" data-action="clear">Clear</button>`;
    }
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-res][data-action="add"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = btn.getAttribute('data-res');
        if ((discardSelection[r] || 0) < (state.players[playerId].resources[r] || 0)) {
          discardSelection[r] = (discardSelection[r] || 0) + 1;
          refresh();
        }
      });
    });
    el('confirmDiscard')?.addEventListener('click', () => {
      const copy = { ...discardSelection };
      if (game.submitDiscard(playerId, copy)) {
        RESOURCES.forEach((r) => { discardSelection[r] = 0; });
        refresh();
      }
    });
    container.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      RESOURCES.forEach((r) => { discardSelection[r] = 0; });
      refresh();
    });
    return;
  }
  if (state.pendingStealTargets && state.pendingStealTargets.length > 0) {
    container.innerHTML = `<div class="phase-title">Steal from</div><div class="steal-btns">` +
      state.pendingStealTargets.map((pid) =>
        `<button type="button" class="btn btn-sm steal-target-btn" data-target="${pid}">${playerName(pid)}</button>`
      ).join('') + '</div>';
    container.querySelectorAll('.steal-target-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = parseInt(btn.getAttribute('data-target'), 10);
        const res = game.stealFromPlayerChosen(pid);
        if (res) log(`${playerName(state.currentPlayerIndex)} stole ${res} from ${playerName(pid)}`);
        refresh();
      });
    });
    return;
  }
  if (state.monopolyResource === 'pending') {
    container.innerHTML = `<div class="phase-title">Monopoly: choose resource</div><div class="discard-row">` +
      RESOURCES.map((r) => `<button type="button" class="btn btn-sm res-btn monopoly-res-btn" data-res="${r}">${r}</button>`).join('') + '</div>';
    container.querySelectorAll('.monopoly-res-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = btn.getAttribute('data-res');
        const n = game.applyMonopoly(r);
        log(`${playerName(state.currentPlayerIndex)} played Monopoly (${r}) and took ${n}`);
        refresh();
      });
    });
    return;
  }
  if (state.yearOfPlentyLeft > 0) {
    container.innerHTML = `<div class="phase-title">Year of Plenty: take ${state.yearOfPlentyLeft} more</div><div class="discard-row">` +
      RESOURCES.map((r) => `<button type="button" class="btn btn-sm res-btn yop-res-btn" data-res="${r}">${r}</button>`).join('') + '</div>';
    container.querySelectorAll('.yop-res-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = btn.getAttribute('data-res');
        if (game.takeYearOfPlentyResource(r)) {
          log(`${playerName(state.currentPlayerIndex)} took 1 ${r} (Year of Plenty)`);
          refresh();
        }
      });
    });
    return;
  }
  container.innerHTML = '';
}

function updateDevCardsContainer() {
  const container = el('devCardsContainer');
  if (!container) return;
  const cp = game.currentPlayer();
  const cards = cp.devCards || [];
  if (cards.length === 0) {
    container.innerHTML = '<span class="muted">No cards</span>';
    return;
  }
  const labels = { knight: 'Knight', victory_point: 'VP', road_building: 'Road Build', year_of_plenty: 'YOP', monopoly: 'Monopoly' };
  container.innerHTML = cards.map((c, i) => {
    const playable = game.canPlayDevCard(c);
    return `<div class="card-item"><span>${labels[c.type] || c.type}</span>${playable ? `<button type="button" class="btn btn-sm play-btn play-dev-btn" data-index="${i}">Play</button>` : ''}</div>`;
  }).join('');
  container.querySelectorAll('.play-dev-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.getAttribute('data-index'), 10);
      const result = game.playDevCard(i);
      if (result.ok) {
        log(`${playerName(state.currentPlayerIndex)} played ${result.effect}`);
        if (result.effect === 'knight') log('Move the smuggler');
        refresh();
      }
    });
  });
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
  updateCardPhaseContainer();
  updateDevCardsContainer();
  updateEndTurnButton();
  updateDevModeUI();
}

function updateDevModeUI() {
  const dev = isDevMode();
  const checkbox = el('devModeCheckbox');
  const actions = el('devModeActions');
  const skipBtn = el('devSkipTurn');
  const factionBtns = el('devFactionBtns');
  if (checkbox) checkbox.checked = dev;
  if (actions) actions.style.display = dev ? 'flex' : 'none';
  if (skipBtn) {
    const inPlay = state.phase === 'play' && game.getWinner() === null;
    skipBtn.disabled = !inPlay;
  }
  if (dev && factionBtns) {
    factionBtns.innerHTML = state.players
      .map(
        (p) =>
          `<button type="button" class="action-btn dev-faction-btn ${p.id === state.currentPlayerIndex ? 'active' : ''}" data-faction="${p.id}" title="Play as ${playerName(p.id)}">
            <span class="player-dot" style="background:${PLAYER_COLORS[p.id]}"></span>
            ${p.id + 1}
          </button>`
      )
      .join('');
    factionBtns.querySelectorAll('.dev-faction-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-faction'), 10);
        if (!Number.isNaN(id)) {
          game.setCurrentPlayerIndex(id);
          refresh();
        }
      });
    });
  }
}

rollDiceBtn.addEventListener('click', () => {
  if (state.phase !== 'play' || state.diceRoll !== null) return;
  const roll = game.rollDice();
  log(
    `${playerName(state.currentPlayerIndex)} rolled ${roll.d1 + roll.d2}${roll.isSeven ? ' (7 — discard then move smuggler!)' : ''}`
  );
  refresh();
});

el('buyDevCard')?.addEventListener('click', () => {
  const card = game.buyDevCard();
  if (card) {
    log(`${playerName(state.currentPlayerIndex)} bought a development card`);
    refresh();
  }
});

boardEl.addEventListener('click', (e) => {
  const hexIdx = e.target.closest('[data-hex]')?.getAttribute('data-hex');
  if (hexIdx != null && (state.mustMoveRobber || state.sevenPhase === 'move_robber')) {
    const hexIndex = parseInt(hexIdx, 10);
    const result = game.moveRobber(hexIndex);
    if (result.ok) {
      if (result.stoleFrom != null) log(`${playerName(state.currentPlayerIndex)} stole from ${playerName(result.stoleFrom)}`);
      refresh();
    }
    return;
  }
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
        log(`${playerName(state.currentPlayerIndex)} built a city`);
        refresh();
      }
      return;
    }
    if (game.placeSettlement(vertexKey, state.currentPlayerIndex)) {
      if (state.phase === 'setup') {
        log(`${playerName(state.currentPlayerIndex)} placed outpost — now place hyperlane`);
      } else if (state.phase === 'setup2') {
        log(`${playerName(state.currentPlayerIndex)} placed 2nd outpost — now place hyperlane`);
      } else {
        log(`${playerName(state.currentPlayerIndex)} built an outpost`);
      }
      refresh();
    }
  }
  if (edgeKey) {
    if (game.placeRoad(edgeKey, state.currentPlayerIndex)) {
      if (state.phase === 'setup_road') {
        log(`${playerName(state.currentPlayerIndex)} placed hyperlane`);
      } else if (state.phase === 'play') {
        log(`${playerName(state.currentPlayerIndex)} built a hyperlane`);
      }
      refresh();
    }
  }
});

function endTurn() {
  if (state.phase !== 'play' || state.diceRoll === null) return;
  game.nextTurn();
  log(`${playerName(state.currentPlayerIndex)}'s turn`);
  refresh();
}

endTurnBtn.addEventListener('click', endTurn);

function updateEndTurnButton() {
  const mustComplete =
    state.sevenPhase !== null ||
    state.mustMoveRobber ||
    (state.pendingStealTargets && state.pendingStealTargets.length > 0) ||
    state.yearOfPlentyLeft > 0 ||
    state.monopolyResource === 'pending';
  const show =
    state.phase === 'play' &&
    state.diceRoll !== null &&
    game.getWinner() === null &&
    !mustComplete;
  endTurnBtn.style.display = show ? 'block' : 'none';
  endTurnBtn.disabled = !show;
}

el('devModeCheckbox')?.addEventListener('change', (e) => {
  setDevMode(e.target.checked);
  refresh();
});

el('devSkipTurn')?.addEventListener('click', () => {
  if (state.phase !== 'play' || game.getWinner() !== null) return;
  game.nextTurn();
  log(`[Dev] Skipped to ${playerName(state.currentPlayerIndex)}'s turn`);
  refresh();
});

const devFromUrl = new URLSearchParams(location.search).get('dev');
if (devFromUrl !== null) setDevMode(devFromUrl === '1' || devFromUrl === 'true');

refresh();
log('Setup: each faction places 2 outposts and 2 hyperlanes (round 1, then round 2 in reverse order). Then roll to play.');
