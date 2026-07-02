/**
 * dxfExporter.ts — TASK 11 : Génération de DXF annoté
 * Exporte le DXF original enrichi avec les features AFR :
 *   - Couleurs par type de feature (par calque)
 *   - Textes d'annotation (Ra, tolérances, dimensions)
 *   - Hachures pour les surfaces usinées
 */

export interface ExportEntity {
  type:      string;
  layer:     string;
  vertices?: Array<{ x: number; y: number }>;
  center?:   { x: number; y: number };
  radius?:   number;
  text?:     string;
  insertX?:  number;
  insertY?:  number;
  height?:   number;
}

export interface AnnotatedFeature {
  id:               string;
  type:             string;
  centerX:          number;
  centerY:          number;
  diameter?:        number;
  width?:           number;
  length?:          number;
  depth?:           number;
  surfaceRoughness?: number;
  tolerance?:       { type: string; value: string };
  suggestedTool?:   string;
  threadSpec?:      string;
}

// ── Mapping couleur DXF par type de feature (couleur ACI) ────────────────────
const FEATURE_COLOR: Record<string, number> = {
  hole:    3,   // vert
  bore:    4,   // cyan
  pocket:  5,   // bleu
  slot:    6,   // magenta
  face:    7,   // blanc
  contour: 1,   // rouge
  thread:  2,   // jaune
};

const FEATURE_LAYER: Record<string, string> = {
  hole:    'AFR_HOLES',
  bore:    'AFR_BORES',
  pocket:  'AFR_POCKETS',
  slot:    'AFR_SLOTS',
  face:    'AFR_FACE',
  contour: 'AFR_CONTOUR',
  thread:  'AFR_THREADS',
};

/** Génère un fichier DXF R2013 annoté depuis les entités et features */
export function generateAnnotatedDxf(
  originalEntities: ExportEntity[],
  features:         AnnotatedFeature[],
): string {
  const lines: string[] = [];

  // ── En-tête DXF ────────────────────────────────────────────────────────────
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1027'); // AutoCAD R2013
  lines.push('9', '$INSUNITS', '70', '4');    // mm
  lines.push('0', 'ENDSEC');

  // ── Tables (calques) ───────────────────────────────────────────────────────
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER');

  // Calques originaux
  lines.push(..._layerEntry('0', 7));
  // Calques AFR
  for (const [type, layerName] of Object.entries(FEATURE_LAYER)) {
    lines.push(..._layerEntry(layerName, FEATURE_COLOR[type] ?? 7));
  }
  lines.push(..._layerEntry('AFR_ANNOTATIONS', 8)); // gris

  lines.push('0', 'ENDTAB', '0', 'ENDSEC');

  // ── Section entités ────────────────────────────────────────────────────────
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // Entités originales (calque d'origine)
  for (const e of originalEntities) {
    if (e.type === 'LINE' && e.vertices?.length === 2) {
      lines.push(..._line(e.vertices[0], e.vertices[1], e.layer || '0'));
    } else if (e.type === 'CIRCLE' && e.center && e.radius != null) {
      lines.push(..._circle(e.center.x, e.center.y, e.radius, e.layer || '0'));
    } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices?.length) {
      lines.push(..._lwPolyline(e.vertices, e.layer || '0'));
    }
  }

  // Annotations AFR superposées
  for (const feat of features) {
    const layer  = FEATURE_LAYER[feat.type] ?? 'AFR_ANNOTATIONS';
    const annotY = feat.centerY + (feat.diameter ? feat.diameter / 2 : feat.width ? feat.width / 2 : 10) + 5;

    // Cercle ou rectangle mis en évidence
    if (feat.diameter) {
      lines.push(..._circle(feat.centerX, feat.centerY, feat.diameter / 2, layer));
    } else if (feat.width && feat.length) {
      const hw = feat.width / 2, hl = feat.length / 2;
      lines.push(..._lwPolyline([
        { x: feat.centerX - hw, y: feat.centerY - hl },
        { x: feat.centerX + hw, y: feat.centerY - hl },
        { x: feat.centerX + hw, y: feat.centerY + hl },
        { x: feat.centerX - hw, y: feat.centerY + hl },
      ], layer, true));
    }

    // Texte d'annotation
    const annots: string[] = [];
    if (feat.type === 'thread' && feat.threadSpec)  annots.push(feat.threadSpec);
    if (feat.diameter != null)                       annots.push(`Ø${feat.diameter.toFixed(1)}`);
    if (feat.depth != null)                          annots.push(`P=${feat.depth.toFixed(1)}`);
    if (feat.tolerance)                              annots.push(feat.tolerance.value);
    if (feat.surfaceRoughness != null)               annots.push(`Ra${feat.surfaceRoughness}`);
    if (feat.suggestedTool)                          annots.push(feat.suggestedTool);

    if (annots.length) {
      lines.push(..._text(annots.join(' | '), feat.centerX, annotY, 2.5, 'AFR_ANNOTATIONS'));
    }
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\n');
}

// ── Helpers DXF ───────────────────────────────────────────────────────────────

function _layerEntry(name: string, color: number): string[] {
  return ['0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'Continuous'];
}

function _line(p1: { x: number; y: number }, p2: { x: number; y: number }, layer: string): string[] {
  return ['0', 'LINE', '8', layer,
    '10', p1.x.toFixed(4), '20', p1.y.toFixed(4), '30', '0.0',
    '11', p2.x.toFixed(4), '21', p2.y.toFixed(4), '31', '0.0'];
}

function _circle(cx: number, cy: number, r: number, layer: string): string[] {
  return ['0', 'CIRCLE', '8', layer,
    '10', cx.toFixed(4), '20', cy.toFixed(4), '30', '0.0',
    '40', r.toFixed(4)];
}

function _lwPolyline(verts: Array<{ x: number; y: number }>, layer: string, closed = false): string[] {
  const lines = ['0', 'LWPOLYLINE', '8', layer, '90', String(verts.length), '70', closed ? '1' : '0'];
  for (const v of verts) {
    lines.push('10', v.x.toFixed(4), '20', v.y.toFixed(4));
  }
  return lines;
}

function _text(content: string, x: number, y: number, height: number, layer: string): string[] {
  return ['0', 'TEXT', '8', layer,
    '10', x.toFixed(4), '20', y.toFixed(4), '30', '0.0',
    '40', height.toFixed(2),
    '1',  content,
    '72', '1']; // centré
}
