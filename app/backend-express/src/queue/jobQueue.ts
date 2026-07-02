/**
 * jobQueue.ts — File d'attente asynchrone en mémoire
 *
 * Architecture :
 *   - Chaque job (calcul de trajectoire, simulation, G-Code) est exécuté dans un
 *     Worker Thread Node.js isolé pour ne pas bloquer le thread principal Express.
 *   - Si un Worker crashe (OOM, erreur native OpenCASCADE), le job passe à 'failed'
 *     et l'application reste stable → isolation des pannes.
 *   - La progression est diffusée via Server-Sent Events (SSE) au frontend React.
 *   - Concurrence configurable (MAX_CONCURRENT_WORKERS).
 */
import { EventEmitter } from 'events';
import { Worker }       from 'worker_threads';
import path             from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger }       from '../utils/logger';
import type { JobQueueEntry, JobStatus, JobType, JobProgressEvent } from '../types/api.types';

// ── Configuration ──────────────────────────────────────────────────────────────
const MAX_CONCURRENT_WORKERS = 2; // Pas plus de 2 calculs lourds simultanés

// ── Gestionnaire de la file ────────────────────────────────────────────────────
class JobQueue extends EventEmitter {
  private jobs    = new Map<string, JobQueueEntry>();
  private pending: string[] = [];
  private running = 0;

  // ── API publique ─────────────────────────────────────────────────────────────

  /**
   * Enqueue un nouveau job.
   * @param type    Type de calcul
   * @param payload Données d'entrée sérialisables
   * @returns jobId à transmettre au frontend pour le suivi SSE
   */
  enqueue(type: JobType, payload: unknown): string {
    const id = uuidv4();
    const entry: JobQueueEntry = {
      id,
      type,
      status:    'pending',
      progress:  0,
      payload,
      createdAt: new Date(),
    };
    this.jobs.set(id, entry);
    this.pending.push(id);
    this.emit('job:created', entry);
    logger.debug('Job créé', { jobId: id, type });
    this._drain();
    return id;
  }

  /** Récupère l'état d'un job */
  getJob(id: string): JobQueueEntry | undefined {
    return this.jobs.get(id);
  }

  /** Nombre de jobs actifs (running + pending) */
  getActiveCount(): number {
    return this.running + this.pending.length;
  }

  /** Abonnement à la progression d'un job (pour le SSE handler) */
  subscribeProgress(jobId: string, cb: (event: JobProgressEvent) => void): () => void {
    const handler = (event: JobProgressEvent) => {
      if (event.id === jobId) cb(event);
    };
    this.on('job:progress', handler);
    return () => this.off('job:progress', handler);
  }

  /** Arrêt propre : attend la fin des workers actifs */
  async shutdown(): Promise<void> {
    logger.info('JobQueue : arrêt en cours…');
    // En prod, on attendrait que les workers terminent ; ici on purge la file
    this.pending = [];
    await new Promise<void>((resolve) => {
      if (this.running === 0) { resolve(); return; }
      this.once('queue:idle', resolve);
      setTimeout(resolve, 8000); // Timeout de sécurité
    });
  }

  // ── Exécution des workers ──────────────────────────────────────────────────

  private _drain(): void {
    while (this.pending.length > 0 && this.running < MAX_CONCURRENT_WORKERS) {
      const id = this.pending.shift()!;
      this._runWorker(id);
    }
  }

  private _runWorker(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    this.running++;
    this._updateJob(id, { status: 'running', startedAt: new Date() });

    const isPkg   = Boolean((process.versions as Record<string, unknown>).pkg);
    const isTsDev = !__filename.endsWith('.js');

    // ── Mode inline (pkg bundle) ───────────────────────────────────────────
    // Worker Threads ne peuvent pas charger depuis le snapshot pkg (.exe extension
    // rejetée par Node.js). On exécute le calcul directement dans le thread principal.
    // L'application est mono-utilisateur (desktop) donc le blocage est acceptable.
    if (isPkg) {
      const workerPath = path.join(__dirname, 'workers', `${this._workerFilename(job.type)}.js`);
      const mod = require(workerPath) as { execute: (p: unknown) => Promise<unknown> };
      // setImmediate diffère le calcul après le tick courant, ce qui laisse le temps
      // à Express d'envoyer la réponse HTTP (jobId) avant que l'event loop soit occupé.
      setImmediate(async () => {
        try {
          const result = await mod.execute(job.payload);
          this._updateJob(id, { status: 'completed', progress: 100, result, completedAt: new Date() });
          this.emit('job:progress', { id, status: 'completed', progress: 100, result } as JobProgressEvent);
          logger.info('Job terminé (inline)', { jobId: id, type: job.type });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error('Crash worker inline', { jobId: id, error: message });
          this._updateJob(id, { status: 'failed', error: `Crash du moteur de calcul : ${message}`, completedAt: new Date() });
          this.emit('job:progress', { id, status: 'failed', error: message } as JobProgressEvent);
        } finally {
          this._onWorkerExit(id);
        }
      });
      return;
    }

    // ── Mode Worker Thread (dev / Node.js classique) ───────────────────────
    let workerScript: string;
    let execArgvOpts: string[] = [];

    if (isTsDev) {
      workerScript = path.join(__dirname, 'workers', `${this._workerFilename(job.type)}.ts`);
      execArgvOpts = ['--require', 'ts-node/register'];
    } else {
      workerScript = path.join(__dirname, 'workers', `${this._workerFilename(job.type)}.js`);
    }

    const worker = new Worker(workerScript, {
      workerData: { jobId: id, type: job.type, payload: job.payload },
      ...(execArgvOpts.length ? { execArgv: execArgvOpts } : {}),
    });

    worker.on('message', (msg: { progress?: number; result?: unknown; error?: string }) => {
      if (msg.progress !== undefined) {
        this._updateJob(id, { progress: msg.progress });
        this.emit('job:progress', { id, status: 'running', progress: msg.progress } as JobProgressEvent);
      }
      if (msg.result !== undefined) {
        this._updateJob(id, { status: 'completed', progress: 100, result: msg.result, completedAt: new Date() });
        this.emit('job:progress', { id, status: 'completed', progress: 100, result: msg.result } as JobProgressEvent);
        logger.info('Job terminé', { jobId: id, type: job.type });
        this._onWorkerExit(id);
      }
    });

    // ── Isolation des pannes ──────────────────────────────────────────────
    // Si le Worker crash (OOM, native crash OpenCASCADE), le processus principal
    // reste stable. L'erreur est capturée ici.
    worker.on('error', (err) => {
      logger.error('Worker crash — isolation activée', { jobId: id, error: err.message, stack: err.stack });
      this._updateJob(id, { status: 'failed', error: `Crash du moteur de calcul : ${err.message}`, completedAt: new Date() });
      this.emit('job:progress', { id, status: 'failed', error: err.message } as JobProgressEvent);
      this._onWorkerExit(id);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        logger.warn('Worker terminé avec code non-zéro', { jobId: id, code });
        const job = this.jobs.get(id);
        if (job && job.status === 'running') {
          this._updateJob(id, { status: 'failed', error: `Worker terminé (code ${code})`, completedAt: new Date() });
          this.emit('job:progress', { id, status: 'failed', error: `Exit code ${code}` } as JobProgressEvent);
          this._onWorkerExit(id);
        }
      }
    });

    // Timeout de sécurité (10 min max par job)
    const timeout = setTimeout(() => {
      logger.warn('Job timeout — terminaison du worker', { jobId: id });
      worker.terminate();
    }, 10 * 60 * 1000);
    worker.once('exit', () => clearTimeout(timeout));
  }

  private _onWorkerExit(id: string): void {
    this.running = Math.max(0, this.running - 1);
    if (this.running === 0 && this.pending.length === 0) {
      this.emit('queue:idle');
    }
    this._drain(); // Lancer le prochain job en attente
  }

  private _updateJob(id: string, update: Partial<JobQueueEntry>): void {
    const job = this.jobs.get(id);
    if (job) this.jobs.set(id, { ...job, ...update });
  }

  /**
   * Retourne le nom de base du fichier worker (sans extension) pour un type de job.
   */
  private _workerFilename(type: JobType): string {
    const map: Record<JobType, string> = {
      model_conversion: 'ingestionWorker',
      afr_recognition:  'afrWorker',
      trajectory_calc:  'trajectoryWorker',
      collision_sim:    'simulationWorker',
      gcode_gen:        'trajectoryWorker',
    };
    return map[type] ?? 'trajectoryWorker';
  }
}

// ── Singleton global de la file ────────────────────────────────────────────────
export const jobQueue = new JobQueue();
