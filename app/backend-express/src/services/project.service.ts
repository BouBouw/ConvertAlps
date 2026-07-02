/**
 * project.service.ts — TASK 3 : Persistance des projets via Prisma
 * Sauvegarde/chargement des sessions de travail (DXF + features + toolpaths).
 */
import { v4 as uuidv4 }   from 'uuid';
import fs                 from 'fs';
import path               from 'path';
import { logger }         from '../utils/logger';
import { dxfStore, featureStore, model3DStore, toolpathStore } from '../state/sharedStore';

const DATA_DIR = './data/projects';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface ProjectMeta {
  id:          string;
  name:        string;
  description: string;
  dxfId?:      string;
  model3DId?:  string;
  createdAt:   string;
  updatedAt:   string;
  thumbnail?:  string;   // base64 PNG miniature
}

export interface ProjectSnapshot {
  meta:       ProjectMeta;
  dxf?:       object;
  model3D?:   object;
  features:   object[];
  toolpaths:  object[];
}

export class ProjectService {

  async listProjects(): Promise<ProjectMeta[]> {
    ensureDataDir();
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    return files
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')) as ProjectSnapshot;
          return data.meta;
        } catch { return null; }
      })
      .filter(Boolean) as ProjectMeta[];
  }

  async getProject(id: string): Promise<ProjectSnapshot | null> {
    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ProjectSnapshot;
    } catch {
      return null;
    }
  }

  async saveProject(name: string, description = ''): Promise<ProjectMeta> {
    ensureDataDir();
    const id = uuidv4();
    const now = new Date().toISOString();

    // Capturer l'état actuel des stores
    const dxfEntry   = dxfStore.get('current') ?? Array.from(dxfStore.values())[0];
    const model3D    = model3DStore.get('current');
    const featureArr = featureStore.get('model:current') as object[] | undefined
      ?? Array.from(featureStore.entries())
        .filter(([k]) => !k.startsWith('model:'))
        .map(([, v]) => v);
    const toolpaths  = toolpathStore.get('current') ?? [];

    const meta: ProjectMeta = {
      id,
      name:        name.trim() || `Projet_${id.slice(0, 8)}`,
      description,
      dxfId:       dxfEntry?.id,
      model3DId:   (model3D as Record<string, unknown>)?.id as string | undefined,
      createdAt:   now,
      updatedAt:   now,
    };

    const snapshot: ProjectSnapshot = {
      meta,
      dxf:      dxfEntry,
      model3D,
      features: Array.isArray(featureArr) ? featureArr : [featureArr].filter(Boolean),
      toolpaths,
    };

    fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(snapshot, null, 2));
    logger.info('Projet sauvegardé', { id, name: meta.name });
    return meta;
  }

  async loadProject(id: string): Promise<ProjectSnapshot> {
    const snapshot = await this.getProject(id);
    if (!snapshot) throw new Error(`Projet ${id} introuvable`);

    // Restaurer les stores en mémoire
    if (snapshot.dxf) {
      const dxf = snapshot.dxf as { id: string };
      dxfStore.set(dxf.id, snapshot.dxf as never);
      dxfStore.set('current', snapshot.dxf as never);
    }
    if (snapshot.model3D) {
      const m = snapshot.model3D as { id: string };
      model3DStore.set(m.id, snapshot.model3D);
      model3DStore.set('current', snapshot.model3D);
    }
    if (snapshot.features?.length) {
      snapshot.features.forEach(f => {
        const feat = f as { id: string };
        featureStore.set(feat.id, feat as never);
      });
      featureStore.set('model:current', snapshot.features as never);
    }
    if (snapshot.toolpaths?.length) {
      toolpathStore.set('current', snapshot.toolpaths);
    }

    // Mettre à jour updatedAt
    const updated: ProjectSnapshot = {
      ...snapshot,
      meta: { ...snapshot.meta, updatedAt: new Date().toISOString() },
    };
    fs.writeFileSync(
      path.join(DATA_DIR, `${id}.json`),
      JSON.stringify(updated, null, 2)
    );

    logger.info('Projet chargé', { id });
    return snapshot;
  }

  async deleteProject(id: string): Promise<void> {
    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    logger.info('Projet supprimé', { id });
  }

  async updateProject(id: string, updates: Partial<Pick<ProjectMeta, 'name' | 'description'>>): Promise<ProjectMeta> {
    const snapshot = await this.getProject(id);
    if (!snapshot) throw new Error(`Projet ${id} introuvable`);
    const meta = { ...snapshot.meta, ...updates, updatedAt: new Date().toISOString() };
    const updated = { ...snapshot, meta };
    fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(updated, null, 2));
    return meta;
  }
}
