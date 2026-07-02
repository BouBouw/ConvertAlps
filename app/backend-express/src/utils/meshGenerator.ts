/**
 * meshGenerator.ts — Génération procédurale de maillages 3D
 * Produit des géométries Three.js-compatibles (vertices/normals/indices)
 * pour la visualisation des pièces usinées (sans OpenCASCADE).
 */

export interface RawMesh {
  vertices: number[];  // flat [x0,y0,z0, x1,y1,z1, ...]
  normals:  number[];  // flat [nx0,ny0,nz0, ...]
  indices:  number[];  // triangle indices
}

/** Ajoute une face quad (4 vertices + 2 triangles) à un mesh — normales plates */
function pushFace(
  m:  RawMesh,
  v0: [number, number, number], v1: [number, number, number],
  v2: [number, number, number], v3: [number, number, number],
  n:  [number, number, number]
): void {
  const b = m.vertices.length / 3;
  m.vertices.push(...v0, ...v1, ...v2, ...v3);
  m.normals.push(...n, ...n, ...n, ...n);
  // CCW winding (Three.js front-face default)
  m.indices.push(b, b + 1, b + 2,  b, b + 2, b + 3);
}

/**
 * Génère un parallélépipède rectangle (6 faces, normales plates sortantes).
 * Coordonnées : x,y = plan XY, z = hauteur (vers le haut).
 */
export function genBox(
  x: number, y: number, z: number,
  w: number, d: number, h: number
): RawMesh {
  const m: RawMesh = { vertices: [], normals: [], indices: [] };
  if (w <= 0 || d <= 0 || h <= 0) return m;

  pushFace(m, [x, y + d, z],     [x + w, y + d, z],     [x + w, y, z],     [x, y, z],         [0,  0, -1]); // bas
  pushFace(m, [x, y, z + h],     [x + w, y, z + h],     [x + w, y + d, z + h], [x, y + d, z + h], [0,  0,  1]); // haut
  pushFace(m, [x, y, z],         [x + w, y, z],         [x + w, y, z + h], [x, y, z + h],     [0, -1,  0]); // avant
  pushFace(m, [x + w, y + d, z], [x, y + d, z],         [x, y + d, z + h], [x + w, y + d, z + h], [0,  1,  0]); // arrière
  pushFace(m, [x, y + d, z],     [x, y, z],             [x, y, z + h],     [x, y + d, z + h], [-1, 0,  0]); // gauche
  pushFace(m, [x + w, y, z],     [x + w, y + d, z],     [x + w, y + d, z + h], [x + w, y, z + h], [1,  0,  0]); // droite

  return m;
}

/**
 * Génère un cylindre avec calotte supérieure.
 * Orientation : axe Z, base à zBase, sommet à zBase+h.
 */
export function genCylinder(
  cx: number, cy: number, zBase: number,
  r: number, h: number, seg = 20
): RawMesh {
  const m: RawMesh = { vertices: [], normals: [], indices: [] };
  if (r <= 0 || h <= 0 || seg < 3) return m;

  // Paroi latérale (quads)
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const x0 = cx + r * c0, y0 = cy + r * s0;
    const x1 = cx + r * c1, y1 = cy + r * s1;
    // Normale sortante (moyenne angulaire)
    const len = Math.sqrt((c0 + c1) ** 2 + (s0 + s1) ** 2) || 1;
    const nx = (c0 + c1) / len, ny = (s0 + s1) / len;
    // CCW depuis l'extérieur : v0(a0,bas) v1(a1,bas) v2(a1,haut) v3(a0,haut)
    pushFace(m,
      [x0, y0, zBase], [x1, y1, zBase], [x1, y1, zBase + h], [x0, y0, zBase + h],
      [nx, ny, 0]
    );
  }

  // Calotte supérieure (fan de triangles)
  const cIdx = m.vertices.length / 3;
  m.vertices.push(cx, cy, zBase + h);
  m.normals.push(0, 0, 1);

  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const vi = m.vertices.length / 3;
    m.vertices.push(
      cx + r * Math.cos(a0), cy + r * Math.sin(a0), zBase + h,
      cx + r * Math.cos(a1), cy + r * Math.sin(a1), zBase + h
    );
    m.normals.push(0, 0, 1, 0, 0, 1);
    m.indices.push(cIdx, vi, vi + 1); // CCW depuis +Z
  }

  return m;
}

/** Fusionne plusieurs meshes en un seul mesh plat */
export function mergeMeshes(meshes: RawMesh[]): RawMesh {
  const out: RawMesh = { vertices: [], normals: [], indices: [] };
  for (const m of meshes) {
    const base = out.vertices.length / 3;
    out.vertices.push(...m.vertices);
    out.normals.push(...m.normals);
    out.indices.push(...m.indices.map(i => i + base));
  }
  return out;
}

/**
 * Génère une lèvre 3D ("ruban") le long d'une polyligne 2D.
 * Utilisé pour visualiser les tracés SPLINE sur la face du stock.
 * @param pts   Tableau de points {x,y}
 * @param z     Hauteur de base du ruban (top du stock)
 * @param h     Hauteur du ruban au-dessus du stock
 * @param hw    Demi-largeur du ruban
 */
export function genPolylineRibbon(
  pts:  Array<{ x: number; y: number }>,
  z:    number,
  h:    number,
  hw:   number,
  step = 1   // n'émettre qu'un segment sur `step` (réduction de densité)
): RawMesh {
  const m: RawMesh = { vertices: [], normals: [], indices: [] };
  if (pts.length < 2) return m;

  for (let i = 0; i < pts.length - 1; i += step) {
    const j  = Math.min(i + step, pts.length - 1);
    const p0 = pts[i], p1 = pts[j];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) continue;

    // Perpendiculaire normalisée
    const px = (-dy / len) * hw;
    const py = ( dx / len) * hw;

    // Face top du ruban (visible depuis +Z)
    pushFace(m,
      [p0.x - px, p0.y - py, z + h],
      [p0.x + px, p0.y + py, z + h],
      [p1.x + px, p1.y + py, z + h],
      [p1.x - px, p1.y - py, z + h],
      [0, 0, 1]
    );
  }
  return m;
}

