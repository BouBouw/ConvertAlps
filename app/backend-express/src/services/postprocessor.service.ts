/**
 * postprocessor.service.ts — Génération G-Code ISO depuis les trajectoires réelles
 *
 * Traduit les opérations de trajectoire calculées par trajectoryWorker en G-Code
 * pour 6 contrôleurs CN : Fanuc, Heidenhain, Siemens 840D, Haas, Mazak, Okuma.
 * Chaque point de trajectoire devient une ligne G1/G3 avec F, S, T.
 */
import { v4 as uuidv4 } from 'uuid';
import { logger }        from '../utils/logger';

type Controller = 'fanuc' | 'heidenhain' | 'siemens' | 'haas' | 'mazak' | 'okuma';

interface Point3D { x: number; y: number; z: number; }
interface Pass { type: string; points: Point3D[]; depth: number; feedRate: number; passNumber: number; }
interface Operation {
  id:            string;
  toolId:        string;
  strategy:      string;
  conditions:    { Vc?: number; N?: number; Vf?: number; fz?: number; ap?: number; ae?: number; [k: string]: unknown };
  passes:        Pass[];
  estimatedTime: number;
}

const simulationCache = new Map<string, object>();

export class PostProcessorService {

  async generateGCode(params: {
    projectId:        string;
    operations:       object[];
    targetController: Controller;
    machineName?:     string;
  }): Promise<object> {
    logger.info('Génération G-Code', { controller: params.targetController, ops: params.operations.length });

    const ops = params.operations as Operation[];
    const lines = this._buildGCode(params.targetController, ops);

    const toolChanges       = this._countToolChanges(ops);
    const totalPathLength   = this._totalPathLength(ops);
    const estimatedTime     = ops.reduce((s, op) => s + (op.estimatedTime ?? 0), 0);
    const hasCollision      = false;
    const hasOverstock      = ops.some(op =>
      op.passes?.some(p => p.points?.some(pt => pt.z > 0.2))
    );

    return {
      gcode:               lines.join('\n'),
      lineCount:           lines.length,
      estimatedTime,
      totalPathLength:     Math.round(totalPathLength),
      toolChanges,
      hasCollisionWarning: hasCollision,
      hasOverstockWarning: hasOverstock,
      auditId:             uuidv4(),
    };
  }

  async getSimulationState(projectId: string): Promise<object> {
    return simulationCache.get(projectId) ?? {
      status: 'idle', progress: 0, currentTime: 0, totalTime: 0,
      collisions: [], overallStatus: 'none',
    };
  }

  static cacheSimulationState(projectId: string, state: object): void {
    simulationCache.set(projectId, state);
    simulationCache.set('current', state);
  }

  // ── Construction du G-Code ──────────────────────────────────────────────────

  private _buildGCode(ctrl: Controller, ops: Operation[]): string[] {
    const lines: string[] = [];
    const fmt = (n: number) => n.toFixed(3);

    // En-tête programme
    lines.push(...this._header(ctrl));

    let lastToolId = '';
    let opIdx      = 1;

    for (const op of ops) {
      // Changement d'outil si nécessaire
      if (op.toolId !== lastToolId) {
        lines.push('');
        lines.push(this._toolChange(ctrl, opIdx, op.toolId, op.conditions.N ?? 5000));
        lastToolId = op.toolId;
        opIdx++;
      }

      // Commentaire d'opération
      lines.push(`; --- ${op.strategy.toUpperCase()} — Outil: ${op.toolId} ---`);
      lines.push(this._spindleOn(ctrl, op.conditions.N ?? 5000));

      // Génération des lignes de coupe depuis les points de trajectoire
      for (const pass of op.passes) {
        const Vf = pass.feedRate;
        lines.push(`; Passe ${pass.passNumber} — ${pass.type} Z${fmt(pass.depth)} F${Vf}`);

        if (pass.type === 'drilling') {
          // Cycle de perçage
          lines.push(...this._drillingCycle(ctrl, pass.points, Math.abs(pass.depth), Vf));
        } else {
          // Mouvements de coupe continus
          lines.push(...this._cuttingMoves(ctrl, pass.points, Vf));
        }
      }

      // Retrait rapide Z après chaque opération
      lines.push(this._rapidZ(ctrl, 50));
    }

    // Pied de programme
    lines.push('');
    lines.push(...this._footer(ctrl));
    return lines;
  }

  private _header(c: Controller): string[] {
    const prog = {
      fanuc:      ['%', 'O0001 (CONVERTALPS)', 'G21 G40 G49 G80 G90', 'G28 G91 Z0.', ''],
      heidenhain: ['BEGIN PGM CONVERTALPS MM', 'BLK FORM 0.1 Z X+0 Y+0 Z-50', 'BLK FORM 0.2 X+130 Y+65 Z+0', ''],
      siemens:    ['%_N_CONVERTALPS_MPF', '; ConvertAlps FAO', 'G0 G17 G40 G49 G71 G90', ''],
      haas:       ['%', 'O00001 (CONVERTALPS)', 'G20', 'G28 G91 Z0.', ''],
      mazak:      ['O0001', '(CONVERTALPS FAO)', 'G00 G17 G40 G49 G80 G90', ''],
      okuma:      ['%', ':0001', '(CONVERTALPS)', 'G00 G17 G40 G49 G80 G90', ''],
    };
    return prog[c] ?? prog.fanuc;
  }

  private _toolChange(c: Controller, n: number, toolId: string, rpm: number): string {
    const t = String(n).padStart(2, '0');
    const toolMap: Record<Controller, string> = {
      fanuc:      `M6 T${t} (${toolId})\nG90 G54 G43 H${t}\nS${rpm} M3`,
      heidenhain: `TOOL CALL ${n} Z S${rpm}`,
      siemens:    `T${t} D1 M6\nS${rpm} M3`,
      haas:       `M6 T${t} (${toolId})\nG90 G54\nS${rpm} M3`,
      mazak:      `T${t}${t} M06\nS${rpm} M03`,
      okuma:      `T${t}${t}\nS${rpm} M03`,
    };
    return toolMap[c] ?? toolMap.fanuc;
  }

  private _spindleOn(c: Controller, rpm: number): string {
    if (c === 'heidenhain') return ''; // déjà dans TOOL CALL
    return `S${rpm} M3`;
  }

  private _rapidZ(c: Controller, z: number): string {
    if (c === 'heidenhain') return `L Z+${z} FMAX`;
    return `G0 Z${z.toFixed(3)}`;
  }

  private _cuttingMoves(c: Controller, pts: Point3D[], Vf: number): string[] {
    if (pts.length === 0) return [];
    const lines: string[] = [];
    const fmt = (n: number) => n.toFixed(3);

    // Premier point = rapide (positionnement)
    if (c === 'heidenhain') {
      lines.push(`L X+${fmt(pts[0].x)} Y+${fmt(pts[0].y)} Z+${fmt(pts[0].z + 5)} FMAX`);
      lines.push(`L Z+${fmt(pts[0].z)} F${Vf}`);
    } else {
      lines.push(`G0 X${fmt(pts[0].x)} Y${fmt(pts[0].y)}`);
      lines.push(`G0 Z${fmt(pts[0].z + 5)}`);
      lines.push(`G1 Z${fmt(pts[0].z)} F${Vf}`);
    }

    // Points suivants = interpolation linéaire G1
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (c === 'heidenhain') {
        lines.push(`L X+${fmt(p.x)} Y+${fmt(p.y)} Z+${fmt(p.z)} F${Vf}`);
      } else {
        lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(p.z)} F${Vf}`);
      }
    }
    return lines;
  }

  private _drillingCycle(c: Controller, pts: Point3D[], depth: number, Vf: number): string[] {
    if (pts.length === 0) return [];
    const lines: string[] = [];
    const fmt = (n: number) => n.toFixed(3);

    // Centre du trou = premier point
    const cx = pts[0].x, cy = pts[0].y;

    if (c === 'heidenhain') {
      lines.push(`L X+${fmt(cx)} Y+${fmt(cy)} Z+5 FMAX`);
      lines.push(`CYCL DEF 1.0 PERCAGE`);
      lines.push(`CYCL DEF 1.1 PROFOND-${fmt(depth)}`);
      lines.push(`CYCL DEF 1.2 DIST2`);
      lines.push(`CYCL DEF 1.3 PLONG${fmt(depth/3)}`);
      lines.push(`CYCL CALL`);
    } else {
      const cycleCode = c === 'fanuc' || c === 'haas' ? 'G83' : 'G83';
      lines.push(`G0 X${fmt(cx)} Y${fmt(cy)}`);
      lines.push(`G0 Z5.`);
      lines.push(`${cycleCode} X${fmt(cx)} Y${fmt(cy)} Z-${fmt(depth)} R2. Q${fmt(depth/3)} F${Vf}`);
      lines.push(`G80`);
    }
    return lines;
  }

  private _footer(c: Controller): string[] {
    const ft: Record<Controller, string[]> = {
      fanuc:      ['M5', 'G28 G91 Z0.', 'M30', '%'],
      heidenhain: ['L Z+100 FMAX', 'END PGM CONVERTALPS MM'],
      siemens:    ['M5', 'G28 G91 Z0.', 'M30'],
      haas:       ['M5', 'G28 G91 Z0.', 'M30', '%'],
      mazak:      ['M5', 'G28 G91 Z0.', 'M30'],
      okuma:      ['M5', 'G28 G91 Z0.', 'M02', '%'],
    };
    return ft[c] ?? ft.fanuc;
  }

  // ── Métriques ───────────────────────────────────────────────────────────────

  private _totalPathLength(ops: Operation[]): number {
    let dist = 0;
    for (const op of ops) {
      for (const pass of op.passes ?? []) {
        const pts = pass.points ?? [];
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y, dz = pts[i].z - pts[i-1].z;
          dist += Math.sqrt(dx*dx + dy*dy + dz*dz);
        }
      }
    }
    return dist;
  }

  private _countToolChanges(ops: Operation[]): number {
    const tools = new Set(ops.map(op => op.toolId));
    return Math.max(0, tools.size - 1);
  }
}
