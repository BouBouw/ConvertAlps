/**
 * workerEntry.ts — Point d'entrée pkg avec dispatch Worker Threads
 *
 * pkg bundle les scripts dans un snapshot virtuel (/snapshot/...) que les
 * Worker Threads ne peuvent pas charger directement. La solution standard est
 * d'utiliser process.execPath (le binaire lui-même) comme script Worker, puis
 * de dispatchner selon workerData.workerType dès l'entrée.
 *
 * Flux :
 *   - Main thread  → isMainThread === true  → démarre le serveur Express
 *   - Worker thread → isMainThread === false → exécute le worker demandé
 */
import { isMainThread, workerData } from 'worker_threads';

if (!isMainThread) {
  // ── Mode Worker Thread ─────────────────────────────────────────────────────
  // Ce bloc s'exécute lorsque jobQueue spawn: new Worker(process.execPath, ...)
  const { workerType } = (workerData ?? {}) as { workerType?: string };

  switch (workerType) {
    case 'model_conversion':
      require('./queue/workers/ingestionWorker');
      break;
    case 'afr_recognition':
      require('./queue/workers/afrWorker');
      break;
    case 'trajectory_calc':
    case 'gcode_gen':
      require('./queue/workers/trajectoryWorker');
      break;
    case 'collision_sim':
      require('./queue/workers/simulationWorker');
      break;
    default:
      process.stderr.write(`[Worker] Type de worker inconnu : "${workerType}"\n`);
      process.exit(1);
  }
} else {
  // ── Mode serveur principal ─────────────────────────────────────────────────
  require('./server');
}
