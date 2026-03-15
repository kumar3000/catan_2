/**
 * Catan game state and rules.
 */

import {
  getHexData,
  getVerticesAndEdges,
  getVertexHexAdjacency,
  getEdgeVertices
} from './board.js';

const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

// Cost cards
const COST_ROAD = { wood: 1, brick: 1 };
const COST_SETTLEMENT = { wood: 1, brick: 1, sheep: 1, wheat: 1 };
const COST_CITY = { wheat: 2, ore: 3 };
const COST_DEV = { sheep: 1, wheat: 1, ore: 1 };

// Development card deck (standard Catan): 14 Knight, 5 VP, 2 Road Building, 2 Year of Plenty, 2 Monopoly
const DEV_CARD_COUNTS = { knight: 14, victory_point: 5, road_building: 2, year_of_plenty: 2, monopoly: 2 };

function canAfford(resources, cost) {
  return Object.keys(cost).every((r) => (resources[r] || 0) >= cost[r]);
}

function createShuffledDevDeck() {
  const deck = [];
  for (const [type, count] of Object.entries(DEV_CARD_COUNTS)) {
    for (let i = 0; i < count; i++) deck.push(type);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function createGame(numPlayers = 2) {
  const hexData = getHexData();
  const { vertices, edges } = getVerticesAndEdges(hexData);
  const vertexToHexes = getVertexHexAdjacency(hexData, vertices);
  const edgeVertices = getEdgeVertices(edges);

  const players = Array.from({ length: numPlayers }, (_, i) => ({
    id: i,
    name: `Player ${i + 1}`,
    resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    settlements: [],
    cities: [],
    roads: [],
    victoryPoints: 0,
    devCards: [] // each: { type: 'knight'|'victory_point'|'road_building'|'year_of_plenty'|'monopoly', boughtThisTurn: boolean }
  }));

  let currentPlayerIndex = 0;
  let phase = 'setup'; // 'setup' | 'setup_road' | 'setup2' | 'play'
  let setupRound = 1;
  let setupSettlementCount = 0;
  let diceRoll = null;
  let robberHex = hexData.find((h) => h.resource === 'desert').index;
  let devDeck = createShuffledDevDeck();
  // Roll 7: 'discard' → players with >7 discard half; then 'move_robber' → current player moves robber and steals
  let sevenPhase = null; // null | 'discard' | 'move_robber'
  let discardQueue = []; // { playerId, count }[]; current = discardQueue[0]
  let discardSelection = null; // { wood, brick, ... } count selected by current discarding player
  let mustMoveRobber = false; // true after playing Knight or after 7 robber phase
  let pendingStealTargets = null; // [playerId] after moving robber; null when done
  let freeRoadsLeft = 0; // Road Building card
  let yearOfPlentyLeft = 0; // Year of Plenty card
  let monopolyResource = null; // set when playing Monopoly, then apply

  const state = {
    hexData,
    vertices,
    edges,
    vertexToHexes,
    edgeVertices,
    players,
    currentPlayerIndex,
    phase,
    setupRound,
    setupSettlementCount,
    diceRoll,
    robberHex,
    devDeck,
    sevenPhase,
    discardQueue,
    discardSelection,
    mustMoveRobber,
    pendingStealTargets,
    freeRoadsLeft,
    yearOfPlentyLeft,
    monopolyResource,
    selectedVertex: null,
    selectedEdge: null
  };

  function currentPlayer() {
    return state.players[state.currentPlayerIndex];
  }

  function getVertexByKey(key) {
    return state.vertices.find((v) => v.key === key);
  }

  function getEdgeByKey(key) {
    return state.edges.find((e) => e.key === key);
  }

  function isVertexOccupied(vertexKey) {
    for (const p of state.players) {
      if (p.settlements.includes(vertexKey) || p.cities.includes(vertexKey))
        return true;
    }
    return false;
  }

  function isEdgeOccupied(edgeKey) {
    for (const p of state.players) {
      if (p.roads.includes(edgeKey)) return true;
    }
    return false;
  }

  function hasAdjacentRoad(vertexKey, playerId) {
    for (const e of state.edges) {
      if (e.v1 !== vertexKey && e.v2 !== vertexKey) continue;
      if (state.players[playerId].roads.includes(e.key)) return true;
    }
    return false;
  }

  function isAdjacentToOwnBuilding(vertexKey, playerId) {
    const v = getVertexByKey(vertexKey);
    if (!v) return false;
    const tol = 15;
    const check = (list) =>
      list.some((key) => {
        const other = getVertexByKey(key);
        return other && Math.hypot(v.x - other.x, v.y - other.y) < tol;
      });
    const ownSettlements = state.players[playerId].settlements;
    const ownCities = state.players[playerId].cities;
    return check(ownSettlements) || check(ownCities);
  }

  function distanceBetweenVertices(k1, k2) {
    const v1 = getVertexByKey(k1);
    const v2 = getVertexByKey(k2);
    if (!v1 || !v2) return Infinity;
    return Math.hypot(v1.x - v2.x, v1.y - v2.y);
  }

  function isVertexAdjacentToEdge(vertexKey, edgeKey) {
    const e = getEdgeByKey(edgeKey);
    return e && (e.v1 === vertexKey || e.v2 === vertexKey);
      }

  function validSettlementVertices(playerId) {
    if (state.phase === 'setup' || state.phase === 'setup2') {
      const needRoad = state.phase === 'setup2';
      return state.vertices
        .filter((v) => !isVertexOccupied(v.key))
        .filter((v) => {
          if (!needRoad) return true;
          return hasAdjacentRoad(v.key, playerId);
        })
        .filter((v) => {
          const hexes = state.vertexToHexes.get(v.key) || [];
          for (const h of hexes) {
            const hex = state.hexData[h];
            if (hex.resource === 'desert') continue;
            const others = state.vertices.filter((v2) =>
              (state.vertexToHexes.get(v2.key) || []).includes(h)
            );
            const occupied = others.some((v2) => isVertexOccupied(v2.key));
            if (occupied) return false;
          }
          return true;
        })
        .map((v) => v.key);
    }
    return state.vertices
      .filter((v) => !isVertexOccupied(v.key))
      .filter((v) => hasAdjacentRoad(v.key, playerId))
      .filter((v) => !isAdjacentToOwnBuilding(v.key, playerId))
      .filter((v) => {
        const hexes = state.vertexToHexes.get(v.key) || [];
        for (const h of hexes) {
          const others = state.vertices.filter((v2) =>
            (state.vertexToHexes.get(v2.key) || []).includes(h)
          );
          const occupied = others.some((v2) => isVertexOccupied(v2.key));
          if (occupied) return false;
        }
        return true;
      })
      .map((v) => v.key);
  }

  function validRoadEdges(playerId) {
    if (state.phase === 'setup_road') {
      const fromVertex = state.selectedVertex;
      if (!fromVertex) return [];
      return state.edges
        .filter((e) => !isEdgeOccupied(e.key))
        .filter((e) => isVertexAdjacentToEdge(fromVertex, e.key))
        .map((e) => e.key);
    }
    return state.edges
      .filter((e) => !isEdgeOccupied(e.key))
      .filter((e) => hasAdjacentRoad(e.v1, playerId) || hasAdjacentRoad(e.v2, playerId))
      .map((e) => e.key);
  }

  function giveResource(playerId, resource, amount = 1) {
    state.players[playerId].resources[resource] =
      (state.players[playerId].resources[resource] || 0) + amount;
  }

  function payResource(playerId, resource, amount = 1) {
    const r = state.players[playerId].resources[resource] || 0;
    if (r < amount) return false;
    state.players[playerId].resources[resource] = r - amount;
    return true;
  }

  function produceFromHex(hexIndex) {
    const hex = state.hexData[hexIndex];
    if (hex.resource === 'desert' || hex.number === 0) return;
    if (state.robberHex === hexIndex) return;
    if (state.diceRoll === null) return;
    const sum = state.diceRoll.d1 + state.diceRoll.d2;
    if (hex.number !== sum) return;

    const hexVertices = state.vertices.filter((v) =>
      (state.vertexToHexes.get(v.key) || []).includes(hexIndex)
    );
    for (const v of hexVertices) {
      for (let i = 0; i < state.players.length; i++) {
        if (
          state.players[i].settlements.includes(v.key) ||
          state.players[i].cities.includes(v.key)
        ) {
          const amount = state.players[i].cities.includes(v.key) ? 2 : 1;
          giveResource(i, hex.resource, amount);
        }
      }
    }
  }

  function rollDice() {
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    state.diceRoll = { d1, d2 };
    if (d1 + d2 === 7) {
      state.diceRoll.isSeven = true;
      const mustDiscard = getPlayersWhoMustDiscard();
      if (mustDiscard.length > 0) {
        state.sevenPhase = 'discard';
        state.discardQueue = mustDiscard.slice();
      } else {
        state.sevenPhase = 'move_robber';
      }
      state.mustMoveRobber = false;
      state.pendingStealTargets = null;
    } else {
      for (let i = 0; i < state.hexData.length; i++) produceFromHex(i);
    }
    return state.diceRoll;
  }

  function giveStartingResources(vertexKey, playerId) {
    const hexes = state.vertexToHexes.get(vertexKey) || [];
    for (const h of hexes) {
      const hex = state.hexData[h];
      if (hex.resource !== 'desert') giveResource(playerId, hex.resource, 1);
    }
  }

  function totalResourceCount(playerId) {
    const r = state.players[playerId].resources;
    return RESOURCES.reduce((n, res) => n + (r[res] || 0), 0);
  }

  function getTotalVictoryPoints(player) {
    const buildingVP = player.victoryPoints;
    const devVP = (player.devCards || []).filter((c) => c.type === 'victory_point').length;
    return buildingVP + devVP;
  }

  function getPlayersOnHex(hexIndex) {
    const hex = state.hexData[hexIndex];
    if (!hex) return [];
    const vertexKeys = state.vertices
      .filter((v) => (state.vertexToHexes.get(v.key) || []).includes(hexIndex))
      .map((v) => v.key);
    const playerIds = new Set();
    for (const vk of vertexKeys) {
      for (let i = 0; i < state.players.length; i++) {
        if (state.players[i].settlements.includes(vk) || state.players[i].cities.includes(vk)) {
          playerIds.add(i);
        }
      }
    }
    return Array.from(playerIds);
  }

  function moveRobber(hexIndex) {
    if (hexIndex === state.robberHex) return { ok: false };
    state.robberHex = hexIndex;
    const targets = getPlayersOnHex(hexIndex);
    state.mustMoveRobber = false;
    if (state.sevenPhase === 'move_robber') state.sevenPhase = null;
    if (targets.length === 0) return { ok: true, stealTargets: [] };
    if (targets.length === 1) {
      stealFromPlayer(targets[0]);
      return { ok: true, stealTargets: [], stoleFrom: targets[0] };
    }
    state.pendingStealTargets = targets;
    return { ok: true, stealTargets: targets };
  }

  function stealFromPlayer(fromPlayerId) {
    const from = state.players[fromPlayerId].resources;
    const has = RESOURCES.filter((r) => (from[r] || 0) > 0);
    if (has.length === 0) return null;
    const chosen = has[Math.floor(Math.random() * has.length)];
    payResource(fromPlayerId, chosen, 1);
    giveResource(state.currentPlayerIndex, chosen, 1);
    state.pendingStealTargets = null;
    return chosen;
  }

  function stealFromPlayerChosen(fromPlayerId) {
    const from = state.players[fromPlayerId].resources;
    const has = RESOURCES.filter((r) => (from[r] || 0) > 0);
    if (has.length === 0) return null;
    const chosen = has[Math.floor(Math.random() * has.length)];
    payResource(fromPlayerId, chosen, 1);
    giveResource(state.currentPlayerIndex, chosen, 1);
    state.pendingStealTargets = null;
    return chosen;
  }

  function getPlayersWhoMustDiscard() {
    return state.players
      .map((p, i) => ({ playerId: i, count: totalResourceCount(i) }))
      .filter(({ count }) => count > 7)
      .map(({ playerId, count }) => ({ playerId, count: Math.floor(count / 2) }));
  }

  function submitDiscard(playerId, discarded) {
    const total = RESOURCES.reduce((s, r) => s + (discarded[r] || 0), 0);
    const needed = state.discardQueue[0]?.count ?? 0;
    if (state.sevenPhase !== 'discard' || state.discardQueue.length === 0 || state.discardQueue[0].playerId !== playerId) return false;
    if (total !== needed) return false;
    const res = state.players[playerId].resources;
    for (const r of RESOURCES) {
      const n = discarded[r] || 0;
      if (n > (res[r] || 0)) return false;
      for (let i = 0; i < n; i++) payResource(playerId, r);
    }
    state.discardQueue.shift();
    if (state.discardQueue.length === 0) {
      state.sevenPhase = 'move_robber';
    }
    return true;
  }

  function buyDevCard() {
    const pid = state.currentPlayerIndex;
    if (state.phase !== 'play' || state.devDeck.length === 0) return null;
    if (!canAfford(state.players[pid].resources, COST_DEV)) return null;
    if (state.sevenPhase !== null || state.mustMoveRobber || state.pendingStealTargets) return null;
    RESOURCES.forEach((r) => {
      const n = COST_DEV[r] || 0;
      for (let i = 0; i < n; i++) payResource(pid, r);
    });
    const type = state.devDeck.pop();
    const card = { type, boughtThisTurn: true };
    state.players[pid].devCards.push(card);
    return card;
  }

  function canPlayDevCard(card) {
    if (!card || card.type === 'victory_point') return false;
    if (card.boughtThisTurn) return false;
    const pid = state.currentPlayerIndex;
    if (state.phase !== 'play') return false;
    if (state.pendingStealTargets) return false;
    if (card.type === 'knight') return true;
    if (card.type === 'road_building') return state.freeRoadsLeft === 0 && validRoadEdges(pid).length >= 2;
    if (card.type === 'year_of_plenty') return state.yearOfPlentyLeft === 0;
    if (card.type === 'monopoly') return state.monopolyResource === null;
    return false;
  }

  function playDevCard(cardIndex) {
    const pid = state.currentPlayerIndex;
    const hand = state.players[pid].devCards;
    if (cardIndex < 0 || cardIndex >= hand.length) return { ok: false };
    const card = hand[cardIndex];
    if (!canPlayDevCard(card)) return { ok: false };
    if (card.type === 'victory_point') return { ok: false };
    hand.splice(cardIndex, 1);
    if (card.type === 'knight') {
      state.mustMoveRobber = true;
      return { ok: true, effect: 'knight' };
    }
    if (card.type === 'road_building') {
      state.freeRoadsLeft = 2;
      return { ok: true, effect: 'road_building' };
    }
    if (card.type === 'year_of_plenty') {
      state.yearOfPlentyLeft = 2;
      return { ok: true, effect: 'year_of_plenty' };
    }
    if (card.type === 'monopoly') {
      state.monopolyResource = 'pending';
      return { ok: true, effect: 'monopoly' };
    }
    return { ok: false };
  }

  function applyMonopoly(resource) {
    if (state.monopolyResource !== 'pending') return 0;
    const pid = state.currentPlayerIndex;
    let total = 0;
    for (let i = 0; i < state.players.length; i++) {
      if (i === pid) continue;
      const n = state.players[i].resources[resource] || 0;
      total += n;
      state.players[i].resources[resource] = 0;
    }
    state.players[pid].resources[resource] = (state.players[pid].resources[resource] || 0) + total;
    state.monopolyResource = null;
    return total;
  }

  function takeYearOfPlentyResource(resource) {
    if (state.yearOfPlentyLeft <= 0) return false;
    giveResource(state.currentPlayerIndex, resource, 1);
    state.yearOfPlentyLeft--;
    return true;
  }

  function placeSettlement(vertexKey, playerId) {
    const valid = validSettlementVertices(playerId ?? state.currentPlayerIndex);
    if (!valid.includes(vertexKey)) return false;
    const pid = playerId ?? state.currentPlayerIndex;
    state.players[pid].settlements.push(vertexKey);
    state.players[pid].victoryPoints += 1;

    if (state.phase === 'setup' || state.phase === 'setup2') {
      state.selectedVertex = vertexKey;
      if (state.phase === 'setup') {
        state.phase = 'setup_road';
      } else {
        giveStartingResources(vertexKey, pid);
        state.setupSettlementCount++;
        if (state.setupSettlementCount >= state.players.length) {
          state.phase = 'play';
          state.setupSettlementCount = 0;
          state.selectedVertex = null;
          // Current player (who placed last) goes first
        } else {
          state.phase = 'setup_road';
          // selectedVertex stays set so same player places road
        }
      }
    } else {
      if (!canAfford(state.players[pid].resources, COST_SETTLEMENT)) return false;
      RESOURCES.forEach((r) => {
        const n = COST_SETTLEMENT[r] || 0;
        for (let i = 0; i < n; i++) payResource(pid, r);
      });
      state.selectedVertex = null;
    }
    return true;
  }

  function placeRoad(edgeKey, playerId) {
    const pid = playerId ?? state.currentPlayerIndex;
    const valid = validRoadEdges(pid);
    if (!valid.includes(edgeKey)) return false;

    const isFreeRoad = state.freeRoadsLeft > 0;
    if (state.phase === 'play' && !isFreeRoad && !canAfford(state.players[pid].resources, COST_ROAD)) return false;
    if (state.phase === 'play' && !isFreeRoad) {
      RESOURCES.forEach((r) => {
        const n = COST_ROAD[r] || 0;
        for (let i = 0; i < n; i++) payResource(pid, r);
      });
    }

    state.players[pid].roads.push(edgeKey);
    if (isFreeRoad) state.freeRoadsLeft--;

    if (state.phase === 'setup_road') {
      state.selectedVertex = null;
      state.setupSettlementCount++;
      if (state.setupSettlementCount >= state.players.length) {
        if (state.setupRound === 1) {
          state.setupRound = 2;
          state.setupSettlementCount = 0;
          state.phase = 'setup2';
          state.currentPlayerIndex = state.players.length - 1;
        } else {
          state.phase = 'play';
          state.setupSettlementCount = 0;
        }
      } else {
        nextTurn();
        state.phase = 'setup';
      }
    }
    return true;
  }

  function placeCity(vertexKey) {
    const pid = state.currentPlayerIndex;
    if (!state.players[pid].settlements.includes(vertexKey)) return false;
    if (!canAfford(state.players[pid].resources, COST_CITY)) return false;
    state.players[pid].settlements = state.players[pid].settlements.filter(
      (k) => k !== vertexKey
    );
    state.players[pid].cities.push(vertexKey);
    state.players[pid].victoryPoints += 1;
    RESOURCES.forEach((r) => {
      const n = COST_CITY[r] || 0;
      for (let i = 0; i < n; i++) payResource(pid, r);
    });
    return true;
  }

  function nextTurn() {
    const outgoing = state.currentPlayerIndex;
    (state.players[outgoing].devCards || []).forEach((c) => { c.boughtThisTurn = false; });
    state.diceRoll = null;
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    state.selectedVertex = null;
    state.selectedEdge = null;
    state.sevenPhase = null;
    state.discardQueue = [];
    state.mustMoveRobber = false;
    state.pendingStealTargets = null;
  }

  function canBuildRoad() {
    if (state.phase !== 'play') return false;
    if (state.diceRoll === null && state.freeRoadsLeft === 0) return false;
    const valid = validRoadEdges(state.currentPlayerIndex).length > 0;
    const canPay = canAfford(currentPlayer().resources, COST_ROAD);
    return valid && (state.freeRoadsLeft > 0 || canPay);
  }

  function canBuildSettlement() {
    if (state.phase === 'play' && state.diceRoll === null) return false;
    return validSettlementVertices(state.currentPlayerIndex).length > 0;
  }

  function canBuildCity() {
    if (state.phase !== 'play' || state.diceRoll === null) return false;
    const cp = currentPlayer();
    return (
      canAfford(cp.resources, COST_CITY) && cp.settlements.length > 0
    );
  }

  function getWinner() {
    return state.players.find((p) => getTotalVictoryPoints(p) >= 10)?.id ?? null;
  }

  function setCurrentPlayerIndex(index) {
    if (index >= 0 && index < state.players.length) state.currentPlayerIndex = index;
  }

  return {
    state,
    currentPlayer,
    validSettlementVertices,
    validRoadEdges,
    setCurrentPlayerIndex,
    isVertexOccupied,
    isEdgeOccupied,
    getVertexByKey,
    getEdgeByKey,
    placeSettlement,
    placeRoad,
    placeCity,
    rollDice,
    nextTurn,
    canBuildRoad,
    canBuildSettlement,
    canBuildCity,
    canAfford,
    getTotalVictoryPoints,
    getPlayersWhoMustDiscard,
    submitDiscard,
    buyDevCard,
    canPlayDevCard,
    playDevCard,
    applyMonopoly,
    takeYearOfPlentyResource,
    moveRobber,
    stealFromPlayerChosen,
    getPlayersOnHex,
    COST_ROAD,
    COST_SETTLEMENT,
    COST_CITY,
    COST_DEV,
    getWinner,
    RESOURCES
  };
}

export { createGame, RESOURCES };
