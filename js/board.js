/**
 * Catan board layout per official rules.
 * - 19 terrain hexes in 3-4-5-4-3 pattern (flat-top, odd-r).
 * - Resources: 4 Wood (lumber), 4 Wheat (grain), 4 Sheep (wool), 3 Brick (hills), 3 Ore (mountains), 1 Desert.
 * - 18 number tokens: 2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12 (no 7). Desert has no token.
 * - Rule: red numbers (6 and 8) must not be on adjacent hexes.
 */

const HEX_RADIUS = 42;
const HEX_HEIGHT = Math.sqrt(3) * HEX_RADIUS;
const HEX_WIDTH = 2 * HEX_RADIUS;

const ROW_LENGTHS = [3, 4, 5, 4, 3];

// Resource per hex by position (row 0..4, left to right). Official mix.
const RESOURCES = [
  'wood', 'wood', 'sheep',
  'brick', 'wheat', 'ore', 'sheep',
  'desert', 'wood', 'brick', 'wheat', 'ore',
  'sheep', 'wheat', 'ore', 'wood',
  'brick', 'sheep', 'wheat'
];

// Number tokens (0 = desert). Layout chosen so no 6 is adjacent to 8 (official rule).
const NUMBERS = [
  8, 2, 6,
  3, 5, 10, 9,
  0, 11, 4, 10, 8,
  9, 3, 4, 5,
  6, 11, 12
];

// Row,col to hex index (0..18)
function hexIndex(row, col) {
  let i = 0;
  for (let r = 0; r < row; r++) i += ROW_LENGTHS[r];
  return i + col;
}

// Adjacent hex indices (flat-top odd-r). Used to enforce "6 and 8 not adjacent".
function getAdjacentHexIndices(row, col) {
  const adj = [];
  const isOddRow = row % 2 === 1;
  const offsets = isOddRow
    ? [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]]
    : [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
  for (const [dr, dc] of offsets) {
    const r2 = row + dr;
    const c2 = col + dc;
    if (r2 >= 0 && r2 < 5 && c2 >= 0 && c2 < ROW_LENGTHS[r2]) adj.push(hexIndex(r2, c2));
  }
  return adj;
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

const BOUNDARY_TOL = 2;

// Returns ordered list of { x, y } forming the island outline (closed polygon).
function getBoardBoundary(hexData, vertices, edges) {
  const vByKey = new Map(vertices.map((v) => [v.key, v]));
  const hexesTouchingEdge = new Map();
  edges.forEach((e) => hexesTouchingEdge.set(e.key, 0));
  hexData.forEach((hex) => {
    const corners = hex.corners.map((c) => ({ x: c.x, y: c.y }));
    edges.forEach((e) => {
      const v1 = vByKey.get(e.v1);
      const v2 = vByKey.get(e.v2);
      if (!v1 || !v2) return;
      const p1 = { x: v1.x, y: v1.y };
      const p2 = { x: v2.x, y: v2.y };
      const touches1 = corners.some((c) => Math.hypot(c.x - p1.x, c.y - p1.y) < BOUNDARY_TOL);
      const touches2 = corners.some((c) => Math.hypot(c.x - p2.x, c.y - p2.y) < BOUNDARY_TOL);
      if (touches1 && touches2) hexesTouchingEdge.set(e.key, (hexesTouchingEdge.get(e.key) || 0) + 1);
    });
  });
  const boundaryEdgeKeys = new Set([...hexesTouchingEdge.entries()].filter(([, n]) => n === 1).map(([k]) => k));
  const boundaryEdges = edges.filter((e) => boundaryEdgeKeys.has(e.key));
  if (boundaryEdges.length === 0) return [];

  const adj = new Map();
  boundaryEdges.forEach((e) => {
    if (!adj.has(e.v1)) adj.set(e.v1, []);
    adj.get(e.v1).push(e.v2);
    if (!adj.has(e.v2)) adj.set(e.v2, []);
    adj.get(e.v2).push(e.v1);
  });

  const start = boundaryEdges[0].v1;
  const path = [start];
  let prev = null;
  let cur = start;
  const used = new Set();
  do {
    const nexts = adj.get(cur).filter((n) => n !== prev);
    const next = nexts[0];
    if (!next || used.has(next)) break;
    used.add(next);
    path.push(next);
    prev = cur;
    cur = next;
  } while (cur !== start && path.length <= boundaryEdges.length + 2);

  return path.map((k) => {
    const v = vByKey.get(k);
    return v ? { x: v.x, y: v.y } : null;
  }).filter(Boolean);
}

export {
  HEX_RADIUS,
  HEX_HEIGHT,
  HEX_WIDTH,
  getHexData,
  getVerticesAndEdges,
  getVertexHexAdjacency,
  getEdgeVertices,
  getBoardBoundary,
  hexIndex,
  getAdjacentHexIndices,
  ROW_LENGTHS
};
