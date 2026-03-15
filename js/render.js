/**
 * Render Galactic Settlers (Star Wars) board and pieces to SVG.
 */

import { getBoardBoundary } from './board.js';

const RESOURCE_COLORS = {
  wood: '#166534',
  brick: '#78350f',
  sheep: '#4d7c0f',
  wheat: '#ca8a04',
  ore: '#475569',
  desert: '#78716c'
};

const PLAYER_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#ea580c'];

function renderBoard(game, svgEl) {
  const { state } = game;
  const hexData = state.hexData;
  const vertices = state.vertices;
  const edges = state.edges;

  const padding = 60;
  const minX = Math.min(...hexData.flatMap((h) => h.corners.map((c) => c.x))) - padding;
  const maxX = Math.max(...hexData.flatMap((h) => h.corners.map((c) => c.x))) + padding;
  const minY = Math.min(...hexData.flatMap((h) => h.corners.map((c) => c.y))) - padding;
  const maxY = Math.max(...hexData.flatMap((h) => h.corners.map((c) => c.y))) + padding;
  const width = maxX - minX;
  const height = maxY - minY;

  function tx(x) {
    return x - minX;
  }
  function ty(y) {
    return y - minY;
  }

  const validV = new Set(game.validSettlementVertices(state.currentPlayerIndex));
  const validE = new Set(game.validRoadEdges(state.currentPlayerIndex));
  const isRobberPhase = state.mustMoveRobber || state.sevenPhase === 'move_robber';

  const boundary = getBoardBoundary(hexData, vertices, edges);

  let html = '';

  if (boundary.length > 0) {
    const boundaryPoints = boundary.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ');
    html += `<polygon class="board-outline" fill="rgba(15,22,35,0.4)" stroke="rgba(212,175,55,0.85)" stroke-width="3" points="${boundaryPoints}"/>`;
  }

  const ICON_SIZE = 16;
  const CHIT_R = 14;
  hexData.forEach((hex) => {
    const points = hex.corners.map((c) => `${tx(c.x)},${ty(c.y)}`).join(' ');
    const color = RESOURCE_COLORS[hex.resource] || '#666';
    const robber = state.robberHex === hex.index;
    const robberTarget = isRobberPhase && hex.index !== state.robberHex;
    html += `<polygon class="hex-tile ${robber ? 'robber' : ''} ${robberTarget ? 'robber-target' : ''}" data-hex="${hex.index}" fill="${color}" stroke="#0f1623" stroke-width="2" points="${points}"/>`;
    const cx = tx(hex.cx);
    const cy = ty(hex.cy);
    if (hex.resource !== 'desert') {
      const iconY = cy - 28;
      const ix = cx - ICON_SIZE / 2;
      html += `<g class="hex-res-icon" fill="rgba(255,255,255,0.5)"><use href="#icon-${hex.resource}" x="${ix}" y="${iconY}" width="${ICON_SIZE}" height="${ICON_SIZE}"/></g>`;
    }
    if (hex.number > 0) {
      const chitY = cy + 10;
      html += `<circle class="hex-chit" cx="${cx}" cy="${chitY}" r="${CHIT_R}" fill="#f5f5dc" stroke="#2d2d2d" stroke-width="1.5"/>`;
      html += `<text class="hex-number ${hex.number === 6 || hex.number === 8 ? 'red' : ''}" x="${cx}" y="${chitY + 4}" text-anchor="middle">${hex.number}</text>`;
    }
  });

  // Roads (visual only – not clickable)
  edges.forEach((edge) => {
    const v1 = state.vertices.find((v) => v.key === edge.v1);
    const v2 = state.vertices.find((v) => v.key === edge.v2);
    if (!v1 || !v2) return;
    const owner = state.players.find((p) => p.roads.includes(edge.key));
    const color = owner ? PLAYER_COLORS[owner.id % PLAYER_COLORS.length] : 'none';
    const highlight = validE.has(edge.key);
    html += `<line class="road-segment ${highlight ? 'highlight' : ''}" data-edge="${edge.key}" x1="${tx(v1.x)}" y1="${ty(v1.y)}" x2="${tx(v2.x)}" y2="${ty(v2.y)}" stroke="${color}" stroke-width="${owner ? 12 : 0}"/>`;
    if (highlight) {
      html += `<line class="road-segment road-highlight" data-edge="${edge.key}" x1="${tx(v1.x)}" y1="${ty(v1.y)}" x2="${tx(v2.x)}" y2="${ty(v2.y)}"/>`;
    }
  });

  // Clickable hit targets for valid empty edges only (drawn before vertices so vertices are on top)
  edges.forEach((edge) => {
    const v1 = state.vertices.find((v) => v.key === edge.v1);
    const v2 = state.vertices.find((v) => v.key === edge.v2);
    if (!v1 || !v2) return;
    const isEmpty = !state.players.some((p) => p.roads.includes(edge.key));
    const isValid = validE.has(edge.key);
    if (isEmpty && isValid) {
      html += `<line class="road-hit" data-edge="${edge.key}" x1="${tx(v1.x)}" y1="${ty(v1.y)}" x2="${tx(v2.x)}" y2="${ty(v2.y)}"/>`;
    }
  });

  // Settlements, cities, and valid-vertex highlights (only these + road-hit are clickable; drawn on top)
  vertices.forEach((v) => {
    const settlement = state.players.find((p) => p.settlements.includes(v.key));
    const city = state.players.find((p) => p.cities.includes(v.key));
    const highlight = validV.has(v.key);
    const r = 14;
    if (city) {
      const color = PLAYER_COLORS[city.id % PLAYER_COLORS.length];
      html += `<rect class="vertex-city ${highlight ? 'highlight' : ''}" data-vertex="${v.key}" x="${tx(v.x) - r}" y="${ty(v.y) - r}" width="${r * 2}" height="${r * 2}" fill="${color}" stroke="#0a0e17" stroke-width="2" transform="rotate(45 ${tx(v.x)} ${ty(v.y)})"/>`;
    } else if (settlement) {
      const color = PLAYER_COLORS[settlement.id % PLAYER_COLORS.length];
      html += `<circle class="vertex-settlement ${highlight ? 'highlight' : ''}" data-vertex="${v.key}" cx="${tx(v.x)}" cy="${ty(v.y)}" r="${r}" fill="${color}" stroke="#0a0e17" stroke-width="2"/>`;
    } else if (highlight) {
      html += `<circle class="vertex-settlement vertex-highlight" data-vertex="${v.key}" cx="${tx(v.x)}" cy="${ty(v.y)}" r="${r}"/>`;
    }
  });

  svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svgEl.innerHTML = html;
}

export { renderBoard, RESOURCE_COLORS, PLAYER_COLORS };
