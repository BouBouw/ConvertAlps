/**
 * Model3DViewer — Canvas WebGL Three.js (Blue Ice Premium)
 * BUGFIX : resize géré dans le RAF loop → plus de flash de texture
 * TASK 2 : trajectoires FAO colorées par stratégie
 * TASK 7 : animation G-Code lecture progressive
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useAppStore } from '../../store/useAppStore';
import { useAppSettingsStore } from '../../store/useAppSettingsStore';
import { clsx } from 'clsx';
import type { CollisionStatus, ToolpathOperation, StrategyType } from '../../types';

const BG_COLOR: Record<CollisionStatus, number> = {
  none:      0x060D14,
  warning:   0x150B00,
  collision: 0x140000,
};

const TOOLPATH_COLOR: Partial<Record<StrategyType, number>> & { default: number } = {
  face_milling:      0xD6862A,
  trochoidal:        0x7FA6B8,
  adaptive_clearing: 0x9ABFD4,
  pocket_2d:         0x5B6EA6,
  profile_2d:        0x9A7FB8,
  drilling:          0x4AADB8,
  default:           0xD6E6EF,
};

function createPlaceholderMesh(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(60, 25, 40);
  const mat = new THREE.MeshStandardMaterial({
    color:     0x1A2D3E,
    metalness: 0.7,
    roughness: 0.4,
    wireframe: false,
  });
  return new THREE.Mesh(geo, mat);
}

function buildGeometryFromMeshData(
  vertices: Float32Array | number[], normals: Float32Array | number[], indices: Uint32Array | number[],
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(normals),  3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geo.computeBoundingSphere();
  return geo;
}

export function Model3DViewer() {
  const mountRef = useRef<HTMLDivElement>(null);

  const sceneRef       = useRef<THREE.Scene | null>(null);
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef      = useRef<THREE.PerspectiveCamera | null>(null);
  const partMeshRef    = useRef<THREE.Mesh | null>(null);
  const toolpathGrpRef = useRef<THREE.Group | null>(null);
  const gcodeGrpRef    = useRef<THREE.Group | null>(null);
  const rafRef         = useRef<number>(0);
  // BUGFIX: Resize appliqué dans le RAF loop pour éviter le flash WebGL
  const pendingResize  = useRef<{ w: number; h: number } | null>(null);
  const controlsRef    = useRef<OrbitControls | null>(null);
  const gridRef        = useRef<THREE.GridHelper | null>(null);

  const [gcodeLines,   setGcodeLines]   = useState<Array<{x:number;y:number;z:number}>>([]);
  const [gcodeIdx,     setGcodeIdx]     = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [showToolpath, setShowToolpath] = useState(true);
  const gcodeAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { model3D, collisionStatus, toolpaths } = useAppStore((s) => ({
    model3D:         s.model3D,
    collisionStatus: s.collisionStatus,
    toolpaths:       s.toolpaths,
  }));
  const theme = useAppSettingsStore((s) => s.theme);

  // ── Initialisation scène (une seule fois) ──────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    // Style CSS : le canvas prend 100% de l'espace
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width   = '100%';
    renderer.domElement.style.height  = '100%';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const initDark = document.documentElement.dataset.theme !== 'light';
    const initBg   = initDark ? 0x060D14 : 0xEBF4F9;
    scene.background = new THREE.Color(initBg);
    scene.fog        = new THREE.FogExp2(initBg, 0.0006);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 10_000);
    camera.position.set(100, 70, 100);
    cameraRef.current = camera;

    const controls          = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.minDistance    = 5;
    controls.maxDistance    = 3000;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    // Éclairage ice-premium
    scene.add(new THREE.AmbientLight(0xD6E6EF, 0.35));

    const sun = new THREE.DirectionalLight(0xF7FBFD, 1.2);
    sun.position.set(150, 300, 150);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { near: 1, far: 2000, left: -200, right: 200, top: 200, bottom: -200 });
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x7FA6B8, 0.5);
    fill.position.set(-100, 50, -100);
    scene.add(fill);

    // Grille
    const grid = new THREE.GridHelper(2000, 200, initDark ? 0x1A2D3E : 0x7FA6B8, initDark ? 0x111E2B : 0xC4DCEA);
    grid.position.y = -0.5;
    scene.add(grid);
    gridRef.current = grid;
    scene.add(new THREE.AxesHelper(60));

    const tpGroup = new THREE.Group();
    tpGroup.name = 'toolpaths';
    scene.add(tpGroup);
    toolpathGrpRef.current = tpGroup;

    const gcGroup = new THREE.Group();
    gcGroup.name = 'gcode-anim';
    scene.add(gcGroup);
    gcodeGrpRef.current = gcGroup;

    const placeholder = createPlaceholderMesh();
    scene.add(placeholder);
    partMeshRef.current = placeholder;

    // BUGFIX : animate loop applique les resizes en début de frame
    function animate() {
      rafRef.current = requestAnimationFrame(animate);

      // ── Appliquer le resize en début de frame (élimine le flash) ─────────
      if (pendingResize.current) {
        const { w, h } = pendingResize.current;
        pendingResize.current = null;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // ResizeObserver — enregistre seulement, n'appelle pas setSize directement
    const resizeObs = new ResizeObserver(() => {
      if (!mount) return;
      pendingResize.current = { w: mount.clientWidth, h: mount.clientHeight };
    });
    resizeObs.observe(mount);

    return () => {
      resizeObs.disconnect();
      cancelAnimationFrame(rafRef.current);
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Mesh update ──────────────────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (partMeshRef.current) {
      scene.remove(partMeshRef.current);
      partMeshRef.current.geometry.dispose();
      (partMeshRef.current.material as THREE.Material).dispose();
      partMeshRef.current = null;
    }
    let mesh: THREE.Mesh;
    if (model3D?.meshData) {
      const geo = buildGeometryFromMeshData(model3D.meshData.vertices, model3D.meshData.normals, model3D.meshData.indices);
      const mat = new THREE.MeshStandardMaterial({ color: 0x4A8FA8, metalness: 0.45, roughness: 0.45, side: THREE.DoubleSide });
      mesh = new THREE.Mesh(geo, mat);
    } else {
      mesh = createPlaceholderMesh();
    }
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    partMeshRef.current = mesh;

    // ── Centrer la caméra sur le modèle chargé ────────────────────────────
    if (model3D?.meshData) {
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!;
      const center = new THREE.Vector3();
      bb.getCenter(center);
      const size = new THREE.Vector3();
      bb.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 10);
      const dist   = maxDim * 2.2;
      const ctl = controlsRef.current;
      const cam = cameraRef.current;
      if (ctl) { ctl.target.copy(center); }
      if (cam) {
        cam.position.set(
          center.x + dist * 0.6,
          center.y + dist * 0.5,
          center.z + dist * 0.6,
        );
        cam.near = Math.max(0.1, maxDim * 0.001);
        cam.far  = maxDim * 200;
        cam.updateProjectionMatrix();
      }
      if (ctl) ctl.update();
    }
  }, [model3D]);

  // ── Trajectoires ─────────────────────────────────────────────────────────
  useEffect(() => {
    const grp = toolpathGrpRef.current;
    if (!grp) return;
    while (grp.children.length) {
      const c = grp.children[0] as THREE.Line;
      c.geometry.dispose(); (c.material as THREE.Material).dispose(); grp.remove(c);
    }
    if (!showToolpath || !toolpaths.length) return;
    for (const op of toolpaths as ToolpathOperation[]) {
      const color = TOOLPATH_COLOR[op.strategy] ?? TOOLPATH_COLOR.default;
      for (const pass of op.passes) {
        if (!pass.points?.length) continue;
        const pts = pass.points.map((p) => new THREE.Vector3(p.x, p.z, -p.y));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color, linewidth: 1, transparent: true, opacity: 0.8 });
        grp.add(new THREE.Line(geo, mat));
      }
    }
    const allPts: Array<{x:number;y:number;z:number}> = [];
    (toolpaths as ToolpathOperation[]).forEach((op) => op.passes.forEach((p) => p.points?.forEach((pt) => allPts.push(pt))));
    setGcodeLines(allPts);
    setGcodeIdx(0);
    setIsPlaying(false);
  }, [toolpaths, showToolpath]);

  // ── Animation G-Code ──────────────────────────────────────────────────────
  const startGcodeAnim = useCallback(() => {
    if (gcodeAnimRef.current) clearInterval(gcodeAnimRef.current);
    setIsPlaying(true);
    gcodeAnimRef.current = setInterval(() => {
      setGcodeIdx((prev) => {
        const next = prev + 10;
        if (next >= gcodeLines.length) {
          clearInterval(gcodeAnimRef.current!);
          setIsPlaying(false);
          return gcodeLines.length - 1;
        }
        return next;
      });
    }, 33);
  }, [gcodeLines.length]);

  const stopGcodeAnim  = useCallback(() => { if (gcodeAnimRef.current) clearInterval(gcodeAnimRef.current); setIsPlaying(false); }, []);
  const resetGcodeAnim = useCallback(() => { stopGcodeAnim(); setGcodeIdx(0); }, [stopGcodeAnim]);

  useEffect(() => {
    const grp = gcodeGrpRef.current;
    if (!grp) return;
    while (grp.children.length) {
      const c = grp.children[0] as THREE.Line;
      c.geometry.dispose(); (c.material as THREE.Material).dispose(); grp.remove(c);
    }
    if (!gcodeLines.length || gcodeIdx === 0) return;
    const pts = gcodeLines.slice(0, gcodeIdx).map((p) => new THREE.Vector3(p.x, p.z, -p.y));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xF7FBFD, linewidth: 2 });
    grp.add(new THREE.Line(geo, mat));
  }, [gcodeIdx, gcodeLines]);

  // ── Thème + fond collision ───────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    const r     = rendererRef.current;
    if (!scene || !r) return;
    const isDark = document.documentElement.dataset.theme !== 'light';

    // Grille thème
    const oldGrid = gridRef.current;
    if (oldGrid) {
      scene.remove(oldGrid);
      (oldGrid.material as THREE.Material).dispose();
      oldGrid.geometry.dispose();
    }
    const newGrid = new THREE.GridHelper(
      2000, 200,
      isDark ? 0x1A2D3E : 0x7FA6B8,
      isDark ? 0x111E2B : 0xC4DCEA,
    );
    newGrid.position.y = -0.5;
    scene.add(newGrid);
    gridRef.current = newGrid;

    // Couleur fond
    let bgHex: number;
    if (collisionStatus === 'warning')        bgHex = 0x150B00;
    else if (collisionStatus === 'collision') bgHex = 0x140000;
    else                                      bgHex = isDark ? 0x060D14 : 0xEBF4F9;
    const c = new THREE.Color(bgHex);
    scene.background = c;
    r.setClearColor(c, 1);
    if (scene.fog instanceof THREE.FogExp2) scene.fog.color.set(c);
  }, [theme, collisionStatus]);

  const totalPts = (toolpaths as ToolpathOperation[])
    .reduce((s, op) => s + op.passes.reduce((ps, p) => ps + (p.points?.length ?? 0), 0), 0);

  return (
    <div ref={mountRef} className="relative w-full h-full" style={{ background: 'var(--bg-app)' }}>

      {/* Collision border */}
      {collisionStatus === 'collision' && (
        <div className="absolute inset-0 pointer-events-none border-2 border-red-500 animate-pulse-fast z-10 rounded" />
      )}
      {collisionStatus === 'warning' && (
        <div className="absolute inset-0 pointer-events-none border border-amber-500/70 z-10 rounded" />
      )}

      {/* Overlay contrôles trajectoires */}
      {(toolpaths.length > 0 || gcodeLines.length > 0) && (
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
          <button
            onClick={() => setShowToolpath((v) => !v)}
            className={clsx(
              'text-[10px] px-2.5 py-1 rounded border font-medium transition-all duration-150 backdrop-blur-sm',
              showToolpath
                ? 'bg-ice-500/10 border-ice-500/25 text-ice-300'
                : 'bg-navy-800/70 border-navy-400/30 text-ice-800/60',
            )}
          >
            {showToolpath ? '● Trajectoires' : '○ Trajectoires'}
          </button>

          {gcodeLines.length > 0 && (
            <div className="flex items-center gap-2 bg-navy-850/80 backdrop-blur-sm border border-navy-400/25 rounded px-2.5 py-1.5">
              <span className="text-[10px] text-ice-800/60 mr-0.5">Lecture</span>
              <button onClick={isPlaying ? stopGcodeAnim : startGcodeAnim}
                className="text-[11px] text-ice-400 hover:text-ice-200 font-mono transition-colors">
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button onClick={resetGcodeAnim}
                className="text-[11px] text-ice-800/60 hover:text-ice-300 font-mono transition-colors">
                ⏮
              </button>
              <div className="w-20 h-0.5 bg-navy-500/60 rounded-full overflow-hidden">
                <div className="h-full bg-ice-500 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.round((gcodeIdx / Math.max(gcodeLines.length, 1)) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-ice-500 font-mono tabular-nums w-8 text-right">
                {Math.round((gcodeIdx / Math.max(gcodeLines.length, 1)) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Infos bas */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
        <span className="text-[10px] bg-navy-850/80 backdrop-blur-sm px-2 py-0.5 rounded border border-navy-400/20 text-ice-800/70">
          WebGL · Three.js
        </span>
        {model3D && (
          <>
            <span className="badge badge-ice">V = {((model3D.volume ?? 0) / 1000).toFixed(2)} cm³</span>
            <span className={model3D.isWatertight ? 'badge badge-green' : 'badge badge-amber'}>
              {model3D.isWatertight ? '✓ Étanche' : '⚠ Ouvert'}
            </span>
          </>
        )}
        {totalPts > 0 && (
          <span className="badge badge-ice">{totalPts.toLocaleString()} pts</span>
        )}
      </div>
    </div>
  );
}
