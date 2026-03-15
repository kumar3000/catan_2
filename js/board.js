/**
 * Catan board layout: 19 hexes in 3-4-5-4-3 pattern.
 * Standard resource and number token layout (balanced).
 */

const HEX_RADIUS = 42;
const HEX_HEIGHT = Math.sqrt(3) * HEX_RADIUS;
const HEX_WIDTH = 2 * HEX_RADIUS;

// Row lengths: 3, 4, 5, 4, 3
const ROW_LENGTHS = [3, 4, 5, 4, 3];

// Standard layout: resource type per hex (row index, col index)
// wood, brick, sheep, wheat, ore, desert
const RESOURCES = [
  'wood', 'wood', 'sheep',
  'brick', 'wheat', 'ore', 'sheep',
  'desert', 'wood', 'brick', 'wheat', 'ore',
  'sheep', 'wheat', 'ore', 'wood',
  'brick', 'sheep', 'wheat'
];

// Number tokens (no 7; desert has no number). Order matches hex index.
const NUMBERS = [
  5, 2, 6,
  3, 8, 10, 9,
  0, 11, 4, 8, 10,
  9, 3, 4, 5,
  6, 11, 12
];

// Flatten (row, col) to hex index
function hexIndex(row, col) {
  let i = 0;
  for (let r = 0; r < row; r++) i += ROW_LENGTHS[r];
  return i + col;
}

// Hex center in pixel coordinates (flat-top hex grid, odd-r offset)
function hexCenter(row, col) {
  const cx = HEX_RADIUS * Math.sqrt(3) * (col + (row % 2) * 0.5);
  const cy = HEX_RADIUS * (1.5 * row + 0.75);
  return { x: cx, y: cy };
}

// Corners of a flat-top hex (0 = top, then clockwise)
function hexCorners(cx, cy) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    corners.push({
      x: cx + HEX_RADIUS * Math.sin(angle),
      y: cy - HEX_RADIUS * Math.cos(angle)
    });
  }
  return corners;
}

// All 19 hex definitions with row, col, resource, number
function getHexData() {
  const hexes = [];
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < ROW_LENGTHS[row]; col++) {
      const { x, y } = hexCenter(row, col);
      hexes.push({
        index: idx,
        row,
        col,
        cx: x,
        cy: y,
        resource: RESOURCES[idx],
        number: NUMBERS[idx],
        corners: hexCorners(x, y)
      });
      idx++;
    }
  }
  return hexes;
}

// Edges: each edge is between two adjacent hex corners. Store as (vertexKey1, vertexKey2).
// Vertices: each vertex is shared by up to 3 hexes. Key = "row,col,corner"
function getVerticesAndEdges(hexData) {
  const vertexKeys = new Set();
  const edgeSet = new Set();
  const vertexPos = new Map();

  function vKey(r, c, corner) {
    return `${r},${c},${corner}`;
  }

  function addVertex(r, c, corner, x, y) {
    const key = vKey(r, c, corner);
    if (!vertexPos.has(key)) vertexPos.set(key, { x, y });
    return key;
  }

  hexData.forEach((hex) => {
    const { row, col, corners } = hex;
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      const key = addVertex(row, col, i, corners[i].x, corners[i].y);
      const keyNext = addVertex(row, col, next, corners[next].x, corners[next].y);
      vertexKeys.add(key);
      vertexKeys.add(keyNext);
      const edgeKey = [key, keyNext].sort().join('|');
      edgeSet.add(edgeKey);
    }
  });

  let vertices = Array.from(vertexPos.entries()).map(([key, pos]) => ({
    key,
    ...pos
  }));

  const edges = Array.from(edgeSet).map((e) => {
    const [k1, k2] = e.split('|');
    return { key: e, v1: k1, v2: k2 };
  });

  // Merge vertices at same position (shared corners) into one canonical key per position
  const posTol = 1;
  const posKey = (x, y) => `${Math.round(x / posTol) * posTol},${Math.round(y / posTol) * posTol}`;
  const byPos = new Map();
  vertices.forEach((v) => {
    const pk = posKey(v.x, v.y);
    if (!byPos.has(pk)) byPos.set(pk, []);
    byPos.get(pk).push(v);
  });
  const canonicalKey = new Map();
  vertices.forEach((v) => {
    const pk = posKey(v.x, v.y);
    const group = byPos.get(pk);
    const canonical = group[0].key;
    canonicalKey.set(v.key, canonical);
  });
  vertices = vertices.filter((v) => canonicalKey.get(v.key) === v.key);
  const edgesMerged = [];
  const seen = new Set();
  edges.forEach((e) => {
    const c1 = canonicalKey.get(e.v1) || e.v1;
    const c2 = canonicalKey.get(e.v2) || e.v2;
    if (c1 === c2) return;
    const edgeKey = [c1, c2].sort().join('|');
    if (seen.has(edgeKey)) return;
    seen.add(edgeKey);
    edgesMerged.push({ key: edgeKey, v1: c1, v2: c2 });
  });

  return { vertices, edges: edgesMerged };
}

// Which vertices touch which hex (for resource production): each vertex is a corner of 1–3 hexes.
function getVertexHexAdjacency(hexData, vertices) {
  const vertexToHexes = new Map();
  vertices.forEach((v) => vertexToHexes.set(v.key, []));
  const tol = 2;
  hexData.forEach((hex) => {
    const { index, corners } = hex;
    for (const c of corners) {
      for (const v of vertices) {
        if (Math.hypot(v.x - c.x, v.y - c.y) < tol) {
          const arr = vertexToHexes.get(v.key);
          if (!arr.includes(index)) arr.push(index);
        }
      }
    }
  });
  return vertexToHexes;
}

// Which edges connect which vertices (for road placement)
function getEdgeVertices(edges) {
  const map = new Map();
  edges.forEach((e) => {
    map.set(e.key, [e.v1, e.v2]);
  });
  return map;
}

export {
  HEX_RADIUS,
  HEX_HEIGHT,
  HEX_WIDTH,
  getHexData,
  getVerticesAndEdges,
  getVertexHexAdjacency,
  getEdgeVertices,
  hexIndex
};
