/**
 * Render Catan board and pieces to SVG.
 */

const RESOURCE_COLORS = {
  wood: '#4a6741',
  brick: '#8b4513',
  sheep: '#7a9e35',
  wheat: '#c9a227',
  ore: '#5a6a7a',
  desert: '#c4a574'
};

const PLAYER_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#f39c12'];

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

  let html = '';

  // Hexes
  hexData.forEach((hex) => {
    const points = hex.corners.map((c) => `${tx(c.x)},${ty(c.y)}`).join(' ');
    const color = RESOURCE_COLORS[hex.resource] || '#666';
    const robber = state.robberHex === hex.index;
    html += `<polygon class="hex-tile ${robber ? 'robber' : ''}" data-hex="${hex.index}" fill="${color}" stroke="#2d261f" stroke-width="2" points="${points}"/>`;
    if (hex.number > 0) {
      html += `<text class="hex-number ${hex.number === 6 || hex.number === 8 ? 'red' : ''}" x="${tx(hex.cx)}" y="${ty(hex.cy) + 5}" text-anchor="middle">${hex.number}</text>`;
    }
  });

  // Roads
  edges.forEach((edge) => {
    const v1 = state.vertices.find((v) => v.key === edge.v1);
    const v2 = state.vertices.find((v) => v.key === edge.v2);
    if (!v1 || !v2) return;
    const owner = state.players.find((p) => p.roads.includes(edge.key));
    const color = owner ? PLAYER_COLORS[owner.id % PLAYER_COLORS.length] : 'none';
    const highlight = validE.has(edge.key);
    const midX = (v1.x + v2.x) / 2;
    const midY = (v1.y + v2.y) / 2;
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    html += `<line class="road-segment ${highlight ? 'highlight' : ''}" data-edge="${edge.key}" x1="${tx(v1.x)}" y1="${ty(v1.y)}" x2="${tx(v2.x)}" y2="${ty(v2.y)}" stroke="${color}" stroke-width="${owner ? 12 : 0}"/>`;
    if (highlight) {
      html += `<line class="road-segment highlight" data-edge="${edge.key}" x1="${tx(v1.x)}" y1="${ty(v1.y)}" x2="${tx(v2.x)}" y2="${ty(v2.y)}" stroke="rgba(201,162,39,0.6)" stroke-width="10" stroke-dasharray="4 4"/>`;
    }
  });

  // Settlements and cities
  vertices.forEach((v) => {
    const settlement = state.players.find((p) => p.settlements.includes(v.key));
    const city = state.players.find((p) => p.cities.includes(v.key));
    const highlight = validV.has(v.key);
    const r = 14;
    if (city) {
      const color = PLAYER_COLORS[city.id % PLAYER_COLORS.length];
      html += `<rect class="vertex-city ${highlight ? 'highlight' : ''}" data-vertex="${v.key}" x="${tx(v.x) - r}" y="${ty(v.y) - r}" width="${r * 2}" height="${r * 2}" fill="${color}" stroke="#1a1612" stroke-width="2" transform="rotate(45 ${tx(v.x)} ${ty(v.y)})"/>`;
    } else if (settlement) {
      const color = PLAYER_COLORS[settlement.id % PLAYER_COLORS.length];
      html += `<circle class="vertex-settlement ${highlight ? 'highlight' : ''}" data-vertex="${v.key}" cx="${tx(v.x)}" cy="${ty(v.y)}" r="${r}" fill="${color}" stroke="#1a1612" stroke-width="2"/>`;
    } else if (highlight) {
      html += `<circle class="vertex-settlement highlight" data-vertex="${v.key}" cx="${tx(v.x)}" cy="${ty(v.y)}" r="${r}" fill="none" stroke="rgba(201,162,39,0.8)" stroke-width="2" stroke-dasharray="4 4"/>`;
    }
  });

  // Invisible hit targets for roads (so we can click empty edges)
  edges.forEach((edge) => {
    const v1 = state.vertices.find((v) => v.key === edge.v1);
    const v2 = state.vertices.find((v) => v.key === edge.v2);
    if (!v1 || !v2) return;
    if (!state.players.some((p) => p.roads.includes(edge.key))) {
      html += `<line class="road-hit" data-edge="${edge.key}" x1="${tx(v1.x)}" y1="${ty(v1.y)}" x2="${tx(v2.x)}" y2="${ty(v2.y)}" stroke="transparent" stroke-width="16"/>`;
    }
  });

  svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svgEl.innerHTML = html;
}

export { renderBoard, RESOURCE_COLORS, PLAYER_COLORS };
