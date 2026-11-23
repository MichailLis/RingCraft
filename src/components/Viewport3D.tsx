import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MATS, QUALITY_PARAMS } from '../core/constants';
import { buildSpacerSolid } from '../core/solidMesh';
import type { AnalysisResult, MaterialDef, SpacerState } from '../core/types';

export interface Viewport3DHandle {
  resetCam: () => void;
  setViewDirection: (dx: number, dy: number, dz: number) => void;
  orbitBy: (dAzimuthRad: number, dPolarRad: number) => void;
  png: () => string;
}

interface Viewport3DProps {
  state: SpacerState;
  analysis: AnalysisResult;
  visible: boolean;
  onReady: (ok: boolean) => void;
  onSwitchTo2D: () => void;
  onCameraSync?: (viewMatrix: THREE.Matrix4) => void;
}

const BG_THEMES = {
  light: { bg: 0xdbe2ea, ground: 0xcbd3dc, g1: 0x8f9dab, g2: 0xc2ccd6, edge: 0x263240 },
  gray: { bg: 0xb9bfc7, ground: 0xaab1b9, g1: 0x77828e, g2: 0xa7b0ba, edge: 0x1e293b },
  dark: { bg: 0x252b33, ground: 0x1e242b, g1: 0x475569, g2: 0x334155, edge: 0xcbd5e1 },
} as const;

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function makeProceduralTexture(kind: MaterialDef['tex'], maxAniso: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const cx = cv.getContext('2d')!;
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, 256, 256);

  if (kind === 'wood') {
    for (let i = 0; i < 2400; i++) {
      cx.fillStyle = `rgba(60,35,10,${0.04 + Math.random() * 0.1})`;
      cx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 1.5);
    }
    for (let i = 0; i < 26; i++) {
      cx.strokeStyle = `rgba(90,55,20,${0.05 + Math.random() * 0.06})`;
      cx.lineWidth = 0.6 + Math.random();
      cx.beginPath();
      const y = Math.random() * 256;
      cx.moveTo(0, y);
      cx.bezierCurveTo(80, y + Math.random() * 8 - 4, 170, y + Math.random() * 8 - 4, 256, y);
      cx.stroke();
    }
  } else if (kind === 'ply') {
    for (let y = 0; y < 256; y += 9) {
      cx.fillStyle = `rgba(120,75,30,${0.1 + Math.random() * 0.12})`;
      cx.fillRect(0, y, 256, 2.2);
    }
    for (let i = 0; i < 900; i++) {
      cx.fillStyle = `rgba(80,50,20,${0.03 + Math.random() * 0.07})`;
      cx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 1);
    }
  } else if (kind === 'noise') {
    for (let i = 0; i < 4800; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      cx.fillStyle = `rgba(${v},${v},${v},${0.025 + Math.random() * 0.04})`;
      cx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
  } else {
    for (let y = 0; y < 256; y++) {
      const v = Math.random() < 0.5 ? 30 : 250;
      cx.fillStyle = `rgba(${v},${v},255,${0.02 + Math.random() * 0.05})`;
      cx.fillRect(0, y, 256, 1);
    }
  }

  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(1 / 70, 1 / 70);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = maxAniso;
  return tx;
}

function makeContactShadowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const cx = cv.getContext('2d')!;
  const grad = cx.createRadialGradient(64, 64, 16, 64, 64, 62);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
  grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, 128, 128);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function buildPartGroup(
  s: SpacerState,
  a: AnalysisResult,
  seg: number,
  outCount: number,
  forExport: boolean,
  mat: THREE.Material,
  edgeMat: THREE.LineBasicMaterial | null
) {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const lines: THREE.LineSegments[] = [];

  const { geometry, edgeGeometry } = buildSpacerSolid(s, a, seg, outCount, forExport, !forExport && edgeMat !== null);

  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  meshes.push(mesh);

  if (!forExport && edgeMat && edgeGeometry) {
    const ls = new THREE.LineSegments(edgeGeometry, edgeMat);
    group.add(ls);
    lines.push(ls);
  }

  return { group, meshes, lines };
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(function Viewport3D(
  { state, analysis, visible, onReady, onSwitchTo2D, onCameraSync },
  ref
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const analysisRef = useRef(analysis);
  const visibleRef = useRef(visible);
  const onReadyRef = useRef(onReady);
  const onCameraSyncRef = useRef(onCameraSync);

  stateRef.current = state;
  analysisRef.current = analysis;
  visibleRef.current = visible;
  onReadyRef.current = onReady;
  onCameraSyncRef.current = onCameraSync;

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const controlsApiRef = useRef<{
    applyState: () => void;
    resetCam: () => void;
    setViewDirection: (dx: number, dy: number, dz: number) => void;
    orbitBy: (dAzimuthRad: number, dPolarRad: number) => void;
    png: () => string;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    resetCam: () => controlsApiRef.current?.resetCam(),
    setViewDirection: (dx, dy, dz) => controlsApiRef.current?.setViewDirection(dx, dy, dz),
    orbitBy: (dAz, dPol) => controlsApiRef.current?.orbitBy(dAz, dPol),
    png: () => controlsApiRef.current?.png() || '',
  }));

  useEffect(() => {
    controlsApiRef.current?.applyState();
  }, [state, analysis, visible]);

  useEffect(() => {
    const wrapEl = mountRef.current;
    if (!wrapEl) return;
    const wrap: HTMLDivElement = wrapEl;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch {
      setLoading(false);
      setFailed(true);
      onReadyRef.current(false);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));

    wrap.innerHTML = '';
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_THEMES.light.bg);
    scene.fog = new THREE.Fog(BG_THEMES.light.bg, 105, 230);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 450);
    camera.position.set(22, 16, 24);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xfff4e6, 2.35);
    key.position.set(34, 48, 22);
    key.castShadow = !isSoftwareGl;
    key.shadow.camera.left = -36;
    key.shadow.camera.right = 36;
    key.shadow.camera.top = 36;
    key.shadow.camera.bottom = -36;
    key.shadow.camera.near = 5;
    key.shadow.camera.far = 160;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.04;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key, key.target);

    const fill = new THREE.DirectionalLight(0xe4effa, 0.95);
    fill.position.set(-26, 14, 12);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.72);
    rim.position.set(-10, 22, -28);
    scene.add(rim);

    const hemi = new THREE.HemisphereLight(0xf3f6fa, 0xb2bac4, 0.65);
    scene.add(hemi);

    const groundMat = new THREE.MeshStandardMaterial({
      color: BG_THEMES.light.ground,
      roughness: 1,
      metalness: 0,
    });
    const groundGeo = new THREE.CircleGeometry(140, 64);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.015;
    ground.receiveShadow = true;
    scene.add(ground);

    const contactTex = makeContactShadowTexture();
    const contactGeo = new THREE.PlaneGeometry(30, 30);
    const contactMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    const contactPlane = new THREE.Mesh(contactGeo, contactMat);
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = 0.002;
    scene.add(contactPlane);

    let grid = new THREE.GridHelper(80, 80, BG_THEMES.light.g1, BG_THEMES.light.g2);
    grid.position.y = 0.006;
    scene.add(grid);

    const texCache: Record<string, THREE.CanvasTexture> = {};
    const matCache = new Map<string, THREE.MeshStandardMaterial>();
    const edgeMat = new THREE.LineBasicMaterial({
      color: BG_THEMES.light.edge,
      transparent: true,
      opacity: 0.55,
    });

    const getMaterial = (s: SpacerState) => {
      const mk = `${s.material}|${s.tint}`;
      const existing = matCache.get(mk);
      if (existing) return existing;
      const base = MATS[s.material];
      if (!texCache[base.tex]) {
        texCache[base.tex] = makeProceduralTexture(base.tex, maxAniso);
      }
      const col = new THREE.Color(base.color).multiply(new THREE.Color(s.tint));
      const m = new THREE.MeshStandardMaterial({
        color: col,
        roughness: base.rough,
        metalness: base.metal,
        envMapIntensity: base.env,
        map: texCache[base.tex],
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      matCache.set(mk, m);
      if (matCache.size > 20) {
        for (const [k, old] of matCache) {
          if (k !== mk) {
            old.dispose();
            matCache.delete(k);
            break;
          }
        }
      }
      return m;
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 145;
    controls.maxPolarAngle = Math.PI - 0.02;
    controls.minPolarAngle = 0.01;
    controls.target.set(0, 1.0, 0);
    controls.update();
    controls.saveState();
    onCameraSyncRef.current?.(camera.matrixWorldInverse);

    let part: THREE.Group | null = null;
    let partMeshes: THREE.Mesh[] = [];
    let partLines: THREE.LineSegments[] = [];

    const disposePart = () => {
      if (!part) return;
      partMeshes.forEach((m) => m.geometry.dispose());
      partLines.forEach((l) => l.geometry.dispose());
      scene.remove(part);
      part = null;
      partMeshes = [];
      partLines = [];
    };

    let lastGK = '';
    let lastMK = '';
    let qKey = '';
    let lastBg = '';
    let lost = false;

    const geomKey = (s: SpacerState) =>
      [
        s.outerD,
        s.innerD,
        s.thick,
        s.chamfer,
        s.doorBCD,
        s.doorN,
        s.doorHoleD,
        s.doorRot,
        s.doorAutoSpace,
        s.doorSlots,
        s.slotAngle,
        s.ears,
        s.earMargin,
        s.doorBolt,
        s.doorRecess,
        s.doorHeadClear,
        s.spkBCD,
        s.spkN,
        s.spkHoleD,
        s.spkRot,
        s.spkSlots,
        s.spkSlotAngle,
        s.spkBolt,
        s.spkRecess,
        s.spkHeadClear,
        s.quality,
      ]
        .map((v) => (typeof v === 'number' ? +v.toFixed(3) : v))
        .join('|');

    const camGoalPos = new THREE.Vector3();
    const camGoalTarget = new THREE.Vector3();
    const _orbitOffset = new THREE.Vector3();
    const _orbitSpherical = new THREE.Spherical();
    const _dirVec = new THREE.Vector3();
    let camTransitioning = false;

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const syncScene = () => {
      const s = stateRef.current;
      const a = analysisRef.current;
      const q = QUALITY_PARAMS[s.quality] || QUALITY_PARAMS.std;

      if (lastBg !== s.sceneBg) {
        lastBg = s.sceneBg;
        const theme = BG_THEMES[s.sceneBg] || BG_THEMES.light;
        scene.background = new THREE.Color(theme.bg);
        scene.fog = new THREE.Fog(theme.bg, 105, 230);
        groundMat.color.setHex(theme.ground);
        grid.geometry.dispose();
        (grid.material as THREE.Material).dispose();
        scene.remove(grid);
        grid = new THREE.GridHelper(80, 80, theme.g1, theme.g2);
        grid.position.y = 0.006;
        scene.add(grid);
        edgeMat.color.setHex(theme.edge);
        renderer.shadowMap.needsUpdate = true;
      }

      grid.visible = s.grid;
      controls.autoRotate = !isSoftwareGl && !reducedMotion && s.autoRotate && s.rotSpeed > 0;
      controls.autoRotateSpeed = s.rotSpeed * 1.6;

      if (qKey !== s.quality) {
        qKey = s.quality;
        renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, q.pr));
        if (!isSoftwareGl) {
          key.shadow.mapSize.set(q.shadow, q.shadow);
          if (key.shadow.map) {
            key.shadow.map.dispose();
            key.shadow.map = null;
          }
          renderer.shadowMap.needsUpdate = true;
        }
        resize();
      }

      const mk = `${s.material}|${s.tint}`;
      const matChanged = mk !== lastMK;
      if (matChanged) lastMK = mk;
      const mat = getMaterial(s);

      const gk = geomKey(s);
      if (gk !== lastGK) {
        lastGK = gk;
        disposePart();
        const built = buildPartGroup(s, a, q.seg, q.out, false, mat, edgeMat);
        part = built.group;
        partMeshes = built.meshes;
        partLines = built.lines;
        part.scale.setScalar(0.1);
        scene.add(part);

        const cScale = Math.max(1.8, (a.maxR * 2.45) / 10);
        contactPlane.scale.set(cScale / 2.2, cScale / 2.2, 1);
        renderer.shadowMap.needsUpdate = true;
      } else if (matChanged) {
        partMeshes.forEach((m) => {
          m.material = mat;
        });
      }

      partLines.forEach((l) => {
        l.visible = s.edges;
      });
    };

    let frameId = 0;
    let timerId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl.fenceSync) {
          timerId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            timerId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            timerId = window.setTimeout(cb, 80);
          }
        };
        timerId = window.setTimeout(poll, 5);
      } catch {
        timerId = window.setTimeout(cb, 80);
      }
    }

    function requestRender() {
      if (disposed || lost || !visibleRef.current) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        renderDirty = false;

        syncScene();
        if (camTransitioning) {
          if (isSoftwareGl || reducedMotion) {
            camera.position.copy(camGoalPos);
            controls.target.copy(camGoalTarget);
            camTransitioning = false;
          } else {
            camera.position.x = THREE.MathUtils.damp(camera.position.x, camGoalPos.x, 10, dt);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, camGoalPos.y, 10, dt);
            camera.position.z = THREE.MathUtils.damp(camera.position.z, camGoalPos.z, 10, dt);
            controls.target.x = THREE.MathUtils.damp(controls.target.x, camGoalTarget.x, 10, dt);
            controls.target.y = THREE.MathUtils.damp(controls.target.y, camGoalTarget.y, 10, dt);
            controls.target.z = THREE.MathUtils.damp(controls.target.z, camGoalTarget.z, 10, dt);
            if (camera.position.distanceTo(camGoalPos) < 0.06 && controls.target.distanceTo(camGoalTarget) < 0.04) {
              camera.position.copy(camGoalPos);
              controls.target.copy(camGoalTarget);
              camTransitioning = false;
            }
          }
        }

        const stillMoving = controls.update() || camTransitioning || controls.autoRotate;
        onCameraSyncRef.current?.(camera.matrixWorldInverse);
        if (!lost && visibleRef.current && wrap.clientWidth > 1) {
          renderer.render(scene, camera);
        }

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || (stillMoving && visibleRef.current && !lost))) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    const onControlsStart = () => {
      camTransitioning = false;
    };
    const onControlsChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('change', onControlsChange);

    const ro = new ResizeObserver(() => {
      resize();
      requestRender();
    });
    ro.observe(wrap);

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      setFailed(true);
      onReadyRef.current(false);
    };
    const onRestored = () => {
      lost = false;
      setFailed(false);
      renderer.shadowMap.needsUpdate = true;
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    renderer.domElement.addEventListener('webglcontextrestored', onRestored);

    resize();
    syncScene();
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    controlsApiRef.current = {
      applyState: () => {
        if (visibleRef.current) {
          resize();
          requestRender();
        }
      },
      resetCam: () => {
        const yCenter = Math.max(0.6, (stateRef.current.thick * 0.1) / 2);
        const dist = Math.max(18, Math.min(125, analysisRef.current.maxR * 0.36 + stateRef.current.thick * 0.14));
        _dirVec.set(22, 16, 24).normalize();
        camGoalTarget.set(0, yCenter, 0);
        camGoalPos.copy(camGoalTarget).addScaledVector(_dirVec, dist);
        camTransitioning = true;
        requestRender();
      },
      setViewDirection: (dx: number, dy: number, dz: number) => {
        const yCenter = Math.max(0.6, (stateRef.current.thick * 0.1) / 2);
        const curDist = camera.position.distanceTo(controls.target);
        const span = Math.min(130, Math.max(10, curDist || Math.max(24, analysisRef.current.maxR * 0.32)));
        const safeZ = Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4 ? 0.015 : dz;
        _dirVec.set(dx, dy, safeZ).normalize();
        camGoalTarget.set(0, yCenter, 0);
        camGoalPos.copy(camGoalTarget).addScaledVector(_dirVec, span);
        camTransitioning = true;
        requestRender();
      },
      orbitBy: (dAzimuthRad: number, dPolarRad: number) => {
        camTransitioning = false;
        _orbitOffset.copy(camera.position).sub(controls.target);
        _orbitSpherical.setFromVector3(_orbitOffset);
        _orbitSpherical.theta -= dAzimuthRad;
        _orbitSpherical.phi = Math.max(
          controls.minPolarAngle,
          Math.min(controls.maxPolarAngle, _orbitSpherical.phi - dPolarRad)
        );
        _orbitOffset.setFromSpherical(_orbitSpherical);
        camera.position.copy(controls.target).add(_orbitOffset);
        camera.lookAt(controls.target);
        controls.update();
        onCameraSyncRef.current?.(camera.matrixWorldInverse);
        requestRender();
      },
      png: () => {
        syncScene();
        const w = wrap.clientWidth;
        const off = w < 2;
        if (off) {
          renderer.setSize(1280, 960, false);
          camera.aspect = 1280 / 960;
          camera.updateProjectionMatrix();
        }
        renderer.render(scene, camera);
        const url = renderer.domElement.toDataURL('image/png');
        if (off) resize();
        return url;
      },
    };

    setLoading(false);
    onReadyRef.current(true);
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(timerId);
      ro.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      disposePart();
      groundGeo.dispose();
      groundMat.dispose();
      contactGeo.dispose();
      contactMat.dispose();
      contactTex.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      edgeMat.dispose();
      envTex.dispose();
      Object.values(texCache).forEach((t) => t.dispose());
      matCache.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div className={`absolute inset-0 ${visible ? 'block' : 'hidden'}`} role="tabpanel" aria-labelledby="tab-3d">
      <div ref={mountRef} data-testid="viewport-3d-canvas" className="absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(120% 95% at 50% 44%, transparent 64%, rgba(15, 23, 42, 0.1) 100%)',
        }}
      />
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#e9edf2] text-xs font-medium text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#1e63c4]" />
          <span>Инициализация 3D-сцены…</span>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#f1f5f9] p-6 text-center">
          <p className="max-w-sm text-[13px] leading-relaxed text-slate-600">
            <strong className="text-slate-900">3D-просмотр недоступен</strong> в этом браузере.
            <br />
            2D-чертёж, проверки геометрии и экспорт DXF / SVG работают полностью.
          </p>
          <button
            type="button"
            onClick={onSwitchTo2D}
            className="rounded-lg border border-[#cfd8e3] bg-white px-4 py-2 text-xs font-semibold text-[#1e63c4] hover:bg-blue-50 cursor-pointer"
          >
            Открыть чертёж
          </button>
        </div>
      )}
    </div>
  );
});
