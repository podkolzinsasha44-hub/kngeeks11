// 3D figures of the players. Three.js is loaded only when a 3D view is opened.
// The figures are stylised: club kit, number and name are real; faces and bodies are the same
// neutral figurine for everyone (no likeness of a real person is drawn).
import { useEffect, useRef, useState } from 'react';
import type * as THREE_NS from 'three';

type T = typeof THREE_NS;
let lib: Promise<T> | null = null;
const three = () => (lib ??= import('three'));

export interface FigureSpec {
  primary: string;
  secondary: string;
  num?: number | null;
  name?: string;
  keeper?: boolean;
  /** Height of the player in cm (figures are scaled a little). */
  ht?: number;
}

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

function backTexture(THREE: T, s: FigureSpec, shirt: string) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = shirt;
  g.fillRect(0, 0, 256, 256);
  const ink = lum(shirt) > 0.6 ? '#0b1220' : '#ffffff';
  g.fillStyle = ink;
  g.textAlign = 'center';
  if (s.name) {
    g.font = '700 30px "Oswald Variable", Oswald, Arial Narrow, sans-serif';
    g.fillText(s.name.toUpperCase().slice(0, 14), 128, 58, 230);
  }
  if (s.num != null) {
    g.font = '700 150px "Oswald Variable", Oswald, Arial Narrow, sans-serif';
    g.fillText(String(s.num), 128, 206);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A footballer about 1.8 units tall standing on y = 0, facing +z. */
export function makeFigure(THREE: T, s: FigureSpec) {
  const g = new THREE.Group();
  const shirt = s.keeper ? '#f2c230' : s.primary;
  const trim = s.keeper ? '#1b1b1b' : s.secondary;
  const shortsC = s.keeper ? '#1b1b1b' : lum(s.secondary) > 0.92 && lum(s.primary) > 0.92 ? '#1b2a44' : s.secondary;
  const mat = (color: string, rough = 0.62) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04 });
  const skin = mat('#d9b99b', 0.75), boots = mat('#15171c', 0.4), hair = mat('#2a2320', 0.9);
  const add = (geo: THREE_NS.BufferGeometry, m: THREE_NS.Material | THREE_NS.Material[], x: number, y: number, z = 0, rz = 0, rx = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  // Torso: front/back faces carry the shirt; the back has the number.
  const shirtM = mat(shirt);
  const backM = new THREE.MeshStandardMaterial({ map: backTexture(THREE, s, shirt), roughness: 0.62 });
  add(new THREE.BoxGeometry(0.52, 0.62, 0.26), [shirtM, shirtM, shirtM, shirtM, shirtM, backM], 0, 1.2);
  add(new THREE.CylinderGeometry(0.262, 0.262, 0.05, 20), mat(trim), 0, 0.905).scale.set(1, 1, 0.52);
  // Shoulders and arms
  for (const sx of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.085, 0.2, 4, 10), mat(trim), sx * 0.325, 1.36, 0, sx * 0.32);
    add(new THREE.CapsuleGeometry(0.062, 0.3, 4, 10), skin, sx * 0.4, 1.06, 0.02, sx * 0.14, -0.12);
    if (s.keeper) add(new THREE.SphereGeometry(0.085, 12, 10), mat('#f4f4f4', 0.5), sx * 0.425, 0.86, 0.05);
  }
  // Neck, head, hair
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 12), skin, 0, 1.55);
  add(new THREE.SphereGeometry(0.155, 20, 16), skin, 0, 1.71);
  const cap = add(new THREE.SphereGeometry(0.162, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, 0, 1.725, -0.012);
  cap.rotation.x = -0.25;
  // Shorts, legs, socks, boots
  add(new THREE.BoxGeometry(0.5, 0.26, 0.27), mat(shortsC), 0, 0.8);
  for (const sx of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.095, 0.16, 4, 10), mat(shortsC), sx * 0.13, 0.68);
    add(new THREE.CapsuleGeometry(0.075, 0.16, 4, 10), skin, sx * 0.13, 0.5);
    add(new THREE.CapsuleGeometry(0.07, 0.24, 4, 10), mat(shirt), sx * 0.13, 0.24);
    add(new THREE.BoxGeometry(0.13, 0.09, 0.3), boots, sx * 0.13, 0.045, 0.06);
  }
  const k = s.ht ? 0.94 + ((s.ht - 165) / 35) * 0.12 : 1;
  g.scale.setScalar(Math.max(0.92, Math.min(1.08, k)));
  return g;
}

function dispose(THREE: T, scene: THREE_NS.Scene, renderer: THREE_NS.WebGLRenderer) {
  scene.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
      const map = (mt as THREE_NS.MeshStandardMaterial).map;
      if (map) map.dispose();
      mt.dispose();
    }
  });
  renderer.dispose();
  void THREE;
}

function baseScene(THREE: T, canvas: HTMLCanvasElement, w: number, h: number) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dfefff', '#1a2a1e', 1.25));
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#9fd8ff', 0.9);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  return { renderer, scene, sun };
}

/** One player on a small podium: drag to turn him around. */
export function Figure3D({ spec, height = 280, className }: { spec: FigureSpec; height?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const key = `${spec.primary}|${spec.secondary}|${spec.num}|${spec.name}|${spec.keeper}|${spec.ht}`;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stop = false, raf = 0;
    let cleanup = () => {};
    three().then((THREE) => {
      if (stop) return;
      try {
        const w = canvas.clientWidth || 300;
        const { renderer, scene, sun } = baseScene(THREE, canvas, w, height);
        const cam = new THREE.PerspectiveCamera(30, w / height, 0.1, 50);
        cam.position.set(0, 1.25, 5.1);
        cam.lookAt(0, 0.95, 0);
        sun.shadow.camera.left = -2; sun.shadow.camera.right = 2; sun.shadow.camera.top = 3; sun.shadow.camera.bottom = -1;
        const fig = makeFigure(THREE, spec);
        scene.add(fig);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#1f8748', roughness: 0.9 }));
        disc.position.y = -0.04;
        disc.receiveShadow = true;
        scene.add(disc);
        const ringM = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.018, 8, 64), new THREE.MeshBasicMaterial({ color: spec.primary }));
        ringM.rotation.x = Math.PI / 2;
        ringM.position.y = 0.01;
        scene.add(ringM);
        let rot = Math.PI + 0.5, vel = 0.006, drag: number | null = null;
        const down = (e: PointerEvent) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); };
        const move = (e: PointerEvent) => { if (drag == null) return; const dx = e.clientX - drag; drag = e.clientX; rot += dx * 0.012; vel = dx * 0.0012; };
        const up = () => { drag = null; };
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        let cw = w;
        const tick = (t: number) => {
          if (stop) return;
          const nw = canvas.clientWidth;
          if (nw && nw !== cw) { cw = nw; renderer.setSize(nw, height, false); cam.aspect = nw / height; cam.updateProjectionMatrix(); }
          if (drag == null) { rot += vel; vel += ((reduce ? 0 : 0.006) - vel) * 0.03; }
          fig.rotation.y = rot;
          fig.position.y = reduce ? 0 : Math.sin(t / 700) * 0.012;
          renderer.render(scene, cam);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        cleanup = () => {
          canvas.removeEventListener('pointerdown', down);
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
          canvas.removeEventListener('pointercancel', up);
          dispose(THREE, scene, renderer);
        };
      } catch {
        setFailed(true);
      }
    }).catch(() => setFailed(true));
    return () => { stop = true; cancelAnimationFrame(raf); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, height]);
  if (failed) return null;
  return <canvas ref={ref} className={className} style={{ width: '100%', height, touchAction: 'pan-y', display: 'block' }} />;
}

export interface PitchPlayer extends FigureSpec { x: number; y: number; id: number }

/** The whole eleven standing in formation on a 3D pitch. Tap a player to select him. */
export function Pitch3D({ players, selected, onSelect, height = 360 }: { players: PitchPlayer[]; selected?: number | null; onSelect?: (index: number) => void; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const sel = useRef(selected);
  sel.current = selected;
  const cb = useRef(onSelect);
  cb.current = onSelect;
  const key = players.map((p) => `${p.id}:${p.x.toFixed(2)}:${p.y.toFixed(2)}:${p.num}`).join('|') + (players[0]?.primary ?? '');
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stop = false, raf = 0;
    let cleanup = () => {};
    three().then((THREE) => {
      if (stop) return;
      try {
        const w = canvas.clientWidth || 340;
        const { renderer, scene, sun } = baseScene(THREE, canvas, w, height);
        const cam = new THREE.PerspectiveCamera(40, w / height, 0.1, 200);
        // Pitch 13.6 × 21 units (1 unit = 5 m), striped; the own goal is at the near end.
        const c = document.createElement('canvas');
        c.width = 544; c.height = 840;
        const g = c.getContext('2d')!;
        for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#1c7a41' : '#208a4a'; g.fillRect(0, i * 84, 544, 84); }
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
        g.strokeRect(6, 6, 532, 828);
        g.beginPath(); g.moveTo(6, 420); g.lineTo(538, 420); g.stroke();
        g.beginPath(); g.arc(272, 420, 73, 0, Math.PI * 2); g.stroke();
        g.strokeRect(110, 6, 324, 132); g.strokeRect(110, 702, 324, 132);
        g.strokeRect(198, 6, 148, 44); g.strokeRect(198, 790, 148, 44);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const pitch = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 21), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
        pitch.rotation.x = -Math.PI / 2;
        pitch.receiveShadow = true;
        scene.add(pitch);
        sun.position.set(6, 14, 8);
        const sc = sun.shadow.camera;
        sc.left = -12; sc.right = 12; sc.top = 14; sc.bottom = -14; sc.far = 60;
        const figs = players.map((p) => {
          const f = makeFigure(THREE, p);
          // The team stands with its back to the camera and looks at the opponent's goal.
          f.position.set((p.y - 0.5) * 11.6, 0, 9.6 - p.x * 17.5);
          f.rotation.y = Math.PI;
          f.scale.multiplyScalar(1.35);
          scene.add(f);
          return f;
        });
        const marker = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
        marker.rotation.x = -Math.PI / 2;
        marker.position.y = 0.03;
        marker.visible = false;
        scene.add(marker);
        let ang = 0, drag: { x: number; moved: number } | null = null;
        const down = (e: PointerEvent) => { drag = { x: e.clientX, moved: 0 }; canvas.setPointerCapture(e.pointerId); };
        const move = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx); ang = Math.max(-0.9, Math.min(0.9, ang - dx * 0.006)); };
        const up = (e: PointerEvent) => {
          const d = drag;
          drag = null;
          if (!d || d.moved > 8 || !cb.current) return;
          const r = canvas.getBoundingClientRect();
          let best = -1, bd = 46;
          figs.forEach((f, i) => {
            const v = f.position.clone().setY(1).project(cam);
            const dx = (v.x * 0.5 + 0.5) * r.width - (e.clientX - r.left), dy = (-v.y * 0.5 + 0.5) * r.height - (e.clientY - r.top);
            const dist = Math.hypot(dx, dy);
            if (dist < bd) { bd = dist; best = i; }
          });
          if (best >= 0) cb.current(best);
        };
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        // Keep the drawing buffer and the field of view in step with the element (rotation, resize).
        let cw = 0;
        const fit = () => {
          const nw = canvas.clientWidth;
          if (!nw || nw === cw) return;
          cw = nw;
          renderer.setSize(nw, height, false);
          cam.aspect = nw / height;
          // The whole width of the pitch stays in view on narrow screens.
          cam.fov = Math.max(34, Math.min(62, (2 * Math.atan(Math.tan((38 * Math.PI) / 360) / Math.min(1.25, cam.aspect)) * 180) / Math.PI));
          cam.updateProjectionMatrix();
        };
        const tick = () => {
          if (stop) return;
          fit();
          cam.position.set(Math.sin(ang) * 21, 15.5, 2 + Math.cos(ang) * 21);
          cam.lookAt(0, 0, -1.2);
          const s = sel.current;
          marker.visible = s != null && s >= 0 && !!figs[s];
          if (marker.visible) marker.position.set(figs[s!].position.x, 0.03, figs[s!].position.z);
          renderer.render(scene, cam);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        cleanup = () => {
          canvas.removeEventListener('pointerdown', down);
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
          dispose(THREE, scene, renderer);
        };
      } catch {
        setFailed(true);
      }
    }).catch(() => setFailed(true));
    return () => { stop = true; cancelAnimationFrame(raf); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, height]);
  if (failed) return <div className="text-muted text-[13px] p-4">3D-вид недоступен на этом устройстве.</div>;
  return <canvas ref={ref} style={{ width: '100%', height, touchAction: 'pan-y', display: 'block', borderRadius: 18 }} />;
}
