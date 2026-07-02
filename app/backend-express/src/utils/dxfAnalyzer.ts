/**
 * dxfAnalyzer.ts — Analyse géométrique des entités DXF
 *
 * Reconnaît les features d'usinage à partir des primitives DXF :
 *   CIRCLE           → trou de perçage / alésage
 *   LWPOLYLINE fermée → poche (pocket), rainure (slot) ou contour extérieur
 *   LWPOLYLINE ouverte → contour partiel
 *   LINE              → géométrie de délimitation
 */
import type { DxfEntity, DxfCircleEntity, DxfArcEntity, DxfLwPolylineEntity, DxfLineEntity } from 'dxf';
import { v4 as uuidv4 } from 'uuid';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AnalyzedFeature {
  id:                string;
  type:              'hole' | 'pocket' | 'face' | 'contour' | 'slot' | 'bore' | 'thread';
  depth:             number;
  diameter?:         number;
  width?:            number;
  length?:           number;
  centerX:           number;
  centerY:           number;
  layer?:            string;
  tolerance?:        { type: string; value: string };
  surfaceRoughness:  number;
  requiresFinishing: boolean;
  vertices?:         Array<{ x: number; y: number }>;
  // Filetage
  threadPitch?:      number;  // mm/tour
  threadSpec?:       string;  // ex: "M10×1.5"
}

export interface DxfBBox {
  minX: number; minY: number; maxX: number; maxY: number;
  width: number; height: number;
}

export interface DxfAnalysis {
  features:   AnalyzedFeature[];
  outerBBox?: DxfBBox;
  stockDepth: number;   // épaisseur de brut estimée (mm)
}

// ── Utilitaires géométriques ────────────────────────────────────────────────────

function bboxFromPts(pts: Array<{ x: number; y: number }>): DxfBBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Formule de Shoelace — |résultat| = aire du polygone */
function polylineArea(pts: Array<{ x: number; y: number }>): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a / 2);
}

function isNonMachiningLayer(layer: string): boolean {
  const l = layer.toLowerCase();
  return l.includes('dim') || l.includes('text') || l.includes('title') ||
         l.includes('hatch') || l.includes('annotation');
}

// ── Analyse principale ──────────────────────────────────────────────────────────

/** Normalise un cercle issu du store (format normalisé) ou de la lib dxf (format brut) */
function circleCoords(c: DxfCircleEntity & { vertices?: Array<{x:number;y:number}>; radius?: number })
  : { cx: number; cy: number; r: number } {
  const cx = (c as unknown as { x?: number }).x ?? c.vertices?.[0]?.x ?? 0;
  const cy = (c as unknown as { y?: number }).y ?? c.vertices?.[0]?.y ?? 0;
  const r  = (c as unknown as { r?: number }).r ?? c.radius ?? 0;
  return { cx, cy, r };
}

export function analyzeDxf(entities: DxfEntity[]): DxfAnalysis {
  const features: AnalyzedFeature[] = [];

  // ── 1. Cercles → Trous / Alésages / Filetages ─────────────────────────────
  const circles = entities.filter(e => e.type === 'CIRCLE') as DxfCircleEntity[];

  // TASK 8 — Détecter les filetages : chercher des textes "MXX" proches des cercles
  const textEntities = entities.filter(e => e.type === 'TEXT' || e.type === 'MTEXT') as
    Array<{ type: string; text?: string; x?: number; y?: number; insertX?: number; insertY?: number }>;

  for (const c of circles) {
    if (isNonMachiningLayer(c.layer ?? '')) continue;
    const { cx, cy, r } = circleCoords(c as DxfCircleEntity & { vertices?: Array<{x:number;y:number}>; radius?: number });
    if (r <= 0) continue;

    // Chercher un texte de type "M6", "M10×1.5" dans un rayon de 2×D
    const nearbyText = textEntities.find(t => {
      const tx = t.insertX ?? t.x ?? 0;
      const ty = t.insertY ?? t.y ?? 0;
      const dist = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
      return dist < r * 4 && /^M\d+/i.test(t.text ?? '');
    });

    if (nearbyText?.text) {
      // Trou fileté
      const spec  = nearbyText.text.trim();
      const pitch = _guessThreadPitch(r * 2);
      features.push({
        id:                uuidv4(),
        type:              'thread',
        depth:             r * 2.5,
        diameter:          r * 2,
        centerX:           cx,
        centerY:           cy,
        layer:             c.layer,
        tolerance:         { type: '6H', value: '6H' },
        surfaceRoughness:  3.2,
        requiresFinishing: false,
        threadPitch:       pitch,
        threadSpec:        spec,
      });
    } else {
      const isLargeBore = r >= 15;
      features.push({
        id:                uuidv4(),
        type:              isLargeBore ? 'bore' : 'hole',
        depth:             isLargeBore ? 35 : 25,
        diameter:          r * 2,
        centerX:           cx,
        centerY:           cy,
        layer:             c.layer,
        tolerance:         r >= 5 ? { type: 'H7', value: 'H7' } : { type: 'IT10', value: 'IT10' },
        surfaceRoughness:  isLargeBore ? 0.8 : 1.6,
        requiresFinishing: r >= 5,
      });
    }
  }

  // ── 1b. TASK 4 — Arcs → Congés / Poches partielles / Rainures courbes ─────
  const arcs = entities.filter(e => e.type === 'ARC') as DxfArcEntity[];
  for (const a of arcs) {
    if (isNonMachiningLayer(a.layer ?? '')) continue;
    const acx = (a as unknown as { x?: number }).x ?? (a as unknown as { vertices?: Array<{x:number}> }).vertices?.[0]?.x ?? 0;
    const acy = (a as unknown as { y?: number }).y ?? (a as unknown as { vertices?: Array<{y:number}> }).vertices?.[0]?.y ?? 0;
    const ar  = (a as unknown as { r?: number }).r ?? (a as unknown as { radius?: number }).radius ?? 0;
    if (ar <= 0) continue;
    const span = _arcSpan(a.startAngle ?? 0, a.endAngle ?? 360);
    // Arc proche de 360° → traiter comme un cercle
    if (span >= 350) {
      features.push({
        id:                uuidv4(),
        type:              ar >= 15 ? 'bore' : 'hole',
        depth:             25,
        diameter:          ar * 2,
        centerX:           acx,
        centerY:           acy,
        layer:             a.layer,
        tolerance:         { type: 'H7', value: 'H7' },
        surfaceRoughness:  1.6,
        requiresFinishing: true,
      });
    } else if (span >= 90) {
      // Arc partiel significatif → rainure courbe (slot)
      // Approximer par la corde comme largeur
      const w = ar * 2 * Math.sin((span * Math.PI) / 360);
      features.push({
        id:                uuidv4(),
        type:              'slot',
        depth:             10,
        width:             w,
        length:            (span / 360) * 2 * Math.PI * ar, // longueur d'arc
        centerX:           acx,
        centerY:           acy,
        layer:             a.layer,
        tolerance:         { type: 'IT8', value: '±0.05' },
        surfaceRoughness:  1.6,
        requiresFinishing: true,
      });
    }
    // Petits arcs (rayons de congé) → ignorés (non usinables individuellement)
  }

  // ── 2. Polylignes fermées → Contour / Poche / Rainure ─────────────────────
  const closedPls = (entities.filter(
    e => e.type === 'LWPOLYLINE' && (e as DxfLwPolylineEntity).closed === true
  ) as DxfLwPolylineEntity[]).filter(
    p => !isNonMachiningLayer(p.layer ?? '')
  );

  const sorted = closedPls
    .map(p => ({ p, area: polylineArea(p.vertices), bbox: bboxFromPts(p.vertices) }))
    .sort((a, b) => b.area - a.area);

  let outerBBox: DxfBBox | undefined;

  for (let i = 0; i < sorted.length; i++) {
    const { p, bbox } = sorted[i];
    const layer = (p.layer ?? '').toLowerCase();

    if (i === 0) {
      // La plus grande polyline fermée = contour extérieur
      outerBBox = bbox;
      features.push({
        id:                uuidv4(),
        type:              'contour',
        depth:             40,
        width:             bbox.width,
        length:            bbox.height,
        centerX:           (bbox.minX + bbox.maxX) / 2,
        centerY:           (bbox.minY + bbox.maxY) / 2,
        layer:             p.layer,
        tolerance:         { type: 'IT9', value: '±0.1' },
        surfaceRoughness:  3.2,
        requiresFinishing: false,
        vertices:          p.vertices,
      });
    } else {
      // Polylignes intérieures = poches ou rainures
      const ratio = bbox.width > 0 && bbox.height > 0
        ? Math.max(bbox.width, bbox.height) / Math.min(bbox.width, bbox.height)
        : 1;
      const isSlot = ratio > 3.5;
      features.push({
        id:                uuidv4(),
        type:              isSlot ? 'slot' : 'pocket',
        depth:             layer.includes('deep') ? 20 : 15,
        width:             bbox.width,
        length:            bbox.height,
        centerX:           (bbox.minX + bbox.maxX) / 2,
        centerY:           (bbox.minY + bbox.maxY) / 2,
        layer:             p.layer,
        tolerance:         { type: 'IT8', value: '±0.05' },
        surfaceRoughness:  1.6,
        requiresFinishing: true,
        vertices:          p.vertices,
      });
    }
  }

  // ── 3. Fallback sur les lignes si aucune polyligne fermée ─────────────────
  if (!outerBBox) {
    const lines = entities.filter(e => e.type === 'LINE') as DxfLineEntity[];
    if (lines.length >= 3) {
      const pts = lines.flatMap(l => [l.start, l.end]);
      outerBBox = bboxFromPts(pts);
      features.push({
        id:                uuidv4(),
        type:              'contour',
        depth:             40,
        width:             outerBBox.width,
        length:            outerBBox.height,
        centerX:           (outerBBox.minX + outerBBox.maxX) / 2,
        centerY:           (outerBBox.minY + outerBBox.maxY) / 2,
        tolerance:         { type: 'IT9', value: '±0.1' },
        surfaceRoughness:  3.2,
        requiresFinishing: false,
      });
    }
  }

  // ── 4. Surfaçage systématique (Passe 1 de chaque pièce) ───────────────────
  if (outerBBox && !features.some(f => f.type === 'face')) {
    features.push({
      id:                uuidv4(),
      type:              'face',
      depth:             0.5,
      width:             outerBBox.width,
      length:            outerBBox.height,
      centerX:           (outerBBox.minX + outerBBox.maxX) / 2,
      centerY:           (outerBBox.minY + outerBBox.maxY) / 2,
      surfaceRoughness:  3.2,
      requiresFinishing: false,
    });
  }

  return { features, outerBBox, stockDepth: 40 };
}

// ── Helpers filetage ───────────────────────────────────────────────────────────

/** Retourne le pas ISO métrique standard pour un diamètre donné */
function _guessThreadPitch(diameterMm: number): number {
  const ISO_PITCHES: Array<[number, number]> = [
    [3,0.5],[4,0.7],[5,0.8],[6,1],[8,1.25],[10,1.5],[12,1.75],
    [16,2],[20,2.5],[24,3],[30,3.5],[36,4],[42,4.5],[48,5],
  ];
  const match = ISO_PITCHES.find(([d]) => Math.abs(d - diameterMm) < 1);
  return match ? match[1] : 1.5;
}

/** Calcule l'étendue angulaire d'un arc en degrés */
function _arcSpan(startAngle: number, endAngle: number): number {
  let span = endAngle - startAngle;
  if (span <= 0) span += 360;
  return span;
}
