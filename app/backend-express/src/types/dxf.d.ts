/** Déclarations TypeScript pour le package 'dxf' (bjnortier/dxf v4) */
declare module 'dxf' {
  export interface DxfLineEntity {
    type: 'LINE'; layer?: string;
    start: { x: number; y: number; z?: number };
    end:   { x: number; y: number; z?: number };
  }
  export interface DxfCircleEntity {
    type: 'CIRCLE'; layer?: string;
    x: number; y: number; r: number;
  }
  export interface DxfArcEntity {
    type: 'ARC'; layer?: string;
    x: number; y: number; r: number;
    startAngle: number; endAngle: number;
  }
  export interface DxfLwPolylineEntity {
    type: 'LWPOLYLINE'; layer?: string;
    vertices: Array<{ x: number; y: number; bulge?: number }>;
    closed?: boolean;
  }
  export interface DxfSplineEntity {
    type: 'SPLINE'; layer?: string;
    controlPoints?: Array<{ x: number; y: number }>;
  }
  export interface DxfTextEntity {
    type: 'TEXT' | 'MTEXT'; layer?: string;
    text?: string; x?: number; y?: number;
  }
  export interface DxfUnknownEntity {
    type: string; layer?: string;
    [key: string]: unknown;
  }
  export type DxfEntity =
    | DxfLineEntity | DxfCircleEntity | DxfArcEntity
    | DxfLwPolylineEntity | DxfSplineEntity
    | DxfTextEntity | DxfUnknownEntity;

  export interface DxfDocument {
    entities: DxfEntity[];
    header?:  Record<string, unknown>;
    tables?:  Record<string, unknown>;
    blocks?:  Record<string, unknown>;
  }

  export function parseString(content: string): DxfDocument;
  export function denormalise(doc: DxfDocument): DxfEntity[];
  export function groupEntitiesByLayer(doc: DxfDocument): Record<string, DxfEntity[]>;
}
