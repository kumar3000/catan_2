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

function canAfford(resources, cost) {
  return Object.keys(cost).every((r) => (resources[r] || 0) >= cost[r]);
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
    devCards: []
  }));

  let currentPlayerIndex = 0;
  let phase = 'setup'; // 'setup' = place settlement then road (round 1); 'setup2' = same (round 2); 'play'
  let setupRound = 1; // 1 or 2
  let setupSettlementCount = 0; // total settlements placed in current round
  let diceRoll = null;
  let robberHex = hexData.find((h) => h.resource === 'desert').index;

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
      // Robber: move later; for now just skip production
      state.diceRoll.isSeven = true;
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
        state.selectedVertex = null;
        if (state.setupSettlementCount >= state.players.length * 2) {
          state.phase = 'play';
          state.setupSettlementCount = 0;
          state.currentPlayerIndex = state.players.length - 1;
        }
        nextTurn();
      }
    } else {
      const pid2 = state.currentPlayerIndex;
      if (!canAfford(state.players[pid2].resources, COST_SETTLEMENT)) return false;
      RESOURCES.forEach((r) => {
        const n = COST_SETTLEMENT[r] || 0;
        for (let i = 0; i < n; i++) payResource(pid2, r);
      });
      state.selectedVertex = null;
    }
    return true;
  }

  function placeRoad(edgeKey, playerId) {
    const pid = playerId ?? state.currentPlayerIndex;
    const valid = validRoadEdges(pid);
    if (!valid.includes(edgeKey)) return false;

    state.players[pid].roads.push(edgeKey);

    if (state.phase === 'setup_road') {
      state.selectedVertex = null;
      state.setupSettlementCount++;
      if (state.setupSettlementCount >= state.players.length) {
        if (state.setupRound === 1) {
          state.setupRound = 2;
          state.setupSettlementCount = 0;
          state.phase = 'setup2';
        } else {
          state.phase = 'play';
          state.setupSettlementCount = 0;
          state.currentPlayerIndex = state.players.length - 1;
        }
      }
      nextTurn();
    } else if (state.phase === 'play') {
      if (!canAfford(state.players[pid].resources, COST_ROAD)) return false;
      RESOURCES.forEach((r) => {
        const n = COST_ROAD[r] || 0;
        for (let i = 0; i < n; i++) payResource(pid, r);
      });
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
    state.diceRoll = null;
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    state.selectedVertex = null;
    state.selectedEdge = null;
  }

  function canBuildRoad() {
    if (state.phase !== 'play' || state.diceRoll === null) return false;
    return (
      canAfford(currentPlayer().resources, COST_ROAD) &&
      validRoadEdges(state.currentPlayerIndex).length > 0
    );
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
    return state.players.find((p) => p.victoryPoints >= 10)?.id ?? null;
  }

  return {
    state,
    currentPlayer,
    validSettlementVertices,
    validRoadEdges,
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
    COST_ROAD,
    COST_SETTLEMENT,
    COST_CITY,
    getWinner,
    RESOURCES
  };
}

export { createGame, RESOURCES };
