import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { todayInPeru } from '../../../../../shared/peru-date';
import { type Activity, daysWithoutLogs } from '../activity';
import type { FarmLayout } from '../layout';
import { lotWorkerAction } from '../worker-actions';
import { buildBed } from './beds';
import { buildGreenhouse } from './greenhouse';
import { COLORS, SceneAssets } from './materials';
import { Worker } from './worker';

export interface FarmSceneOptions {
  reducedMotion: boolean;
  /** Pointer over a bed (null = none). Coordinates are relative to the host. */
  onHover: (lotId: string | null, x: number, y: number) => void;
  /** Click or tap on a bed (null = empty space). */
  onSelect: (lotId: string | null, x: number, y: number) => void;
}

interface BedEntry {
  frame: THREE.Group;
  activity: Activity;
}

/** Pixels the pointer may move between down and up and still count as a click. */
const CLICK_TOLERANCE = 6;

/**
 * Owns the three.js renderer, camera and controls for the farm map. Renders on
 * demand (only when something changes, or every frame while workers are on
 * screen) and frees everything in `dispose()`.
 */
export class FarmScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labels = new CSS2DRenderer();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
  private readonly controls: OrbitControls;
  private readonly assets = new SceneAssets();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver;
  private readonly hitBoxes: THREE.Mesh[] = [];
  private readonly beds = new Map<string, BedEntry>();
  private readonly content = new THREE.Group();
  private readonly greenhouseLabels: {
    label: CSS2DObject;
    x: number;
    z: number;
    width: number;
    depth: number;
  }[] = [];
  private layout: FarmLayout | null = null;
  /** People working on lots with a log today; while any exist the scene animates. */
  private workers: Worker[] = [];
  private frameId = 0;
  private hovered: string | null = null;
  private selected: string | null = null;
  private down: { x: number; y: number } | null = null;
  private tween: {
    from: [THREE.Vector3, THREE.Vector3];
    to: [THREE.Vector3, THREE.Vector3];
    start: number;
  } | null = null;

  private readonly frameMaterials = {
    today: new THREE.MeshStandardMaterial({
      color: COLORS.today,
      emissive: COLORS.today,
      emissiveIntensity: 0.9,
    }),
    hover: new THREE.MeshStandardMaterial({
      color: COLORS.hover,
      emissive: COLORS.hover,
      emissiveIntensity: 0.8,
    }),
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly options: FarmSceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);

    const labelsEl = this.labels.domElement;
    labelsEl.style.position = 'absolute';
    labelsEl.style.inset = '0';
    labelsEl.style.pointerEvents = 'none';
    // Own stacking context, so label z-indexes never cover the card.
    labelsEl.style.zIndex = '0';
    labelsEl.setAttribute('aria-hidden', 'true');
    host.appendChild(labelsEl);

    this.setUpLights();
    // Ground fades into the sky colour at the horizon.
    this.scene.fog = new THREE.Fog(0xeef0ea, 140, 420);
    this.scene.add(this.content);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !options.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 220;
    this.controls.screenSpacePanning = false;
    // Map-style: drag (one finger) moves over the field, right drag (two fingers) turns.
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.zoomToCursor = true;
    this.controls.addEventListener('change', () => {
      this.keepInside();
      this.requestRender();
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  /** Builds greenhouses and beds. Call again when the data changes. */
  setLayout(layout: FarmLayout, activity: ReadonlyMap<string, Activity>): void {
    this.clearContent();
    this.layout = layout;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2),
      this.assets.material(COLORS.ground, { roughness: 1 }),
    );
    ground.receiveShadow = true;
    this.content.add(ground);

    const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const unitBox = this.assets.geometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1));

    const today = todayInPeru();
    for (const gh of layout.greenhouses) {
      this.content.add(buildGreenhouse(this.assets, gh));
      const ghLabel = this.label(gh.name, 'greenhouse', gh.x, 0.3, gh.z);
      this.greenhouseLabels.push({ label: ghLabel, ...gh });
      this.content.add(ghLabel);

      for (const { lot, x, z, width, depth } of gh.beds) {
        const state = activity.get(lot.id) ?? 'idle';
        // The last action with a phase stays until a newer one is logged; a
        // general action shows only on its day (see lotWorkerAction).
        const action = lotWorkerAction(lot.cycle, today);
        // While someone works on it, the bed shows what that work needs.
        const phase = action?.ridge
          ? (action.phase ?? 1)
          : (action?.phase ?? lot.cycle?.phase?.order ?? null);
        const { group } = buildBed(this.assets, {
          width,
          depth,
          phase,
          seed: lot.number * 7919 + gh.name.length,
          ridgeWork: action?.ridge,
          fruit: !action?.noFruit,
        });
        group.position.set(x, 0, z);
        this.content.add(group);

        const frame = this.frame(x, z, width, depth);
        this.content.add(frame);
        this.beds.set(lot.id, { frame, activity: state });

        const hit = new THREE.Mesh(unitBox, hitMaterial);
        hit.scale.set(width, 2.6, depth);
        hit.position.set(x, 1.3, z);
        hit.userData['lotId'] = lot.id;
        this.hitBoxes.push(hit);
        this.content.add(hit);

        if (action) {
          const worker = new Worker(
            this.assets,
            action,
            { width, depth, phase },
            lot.number * 31 + gh.name.length,
          );
          worker.root.position.set(x, 0, z);
          worker.update(0);
          this.workers.push(worker);
          this.content.add(worker.root);
        }

        const label = this.label(String(lot.number), `lot ${state}`, x, 0.25, z + depth / 2 + 0.7);
        if (state === 'stale') appendStaleDays(label.element, daysWithoutLogs(lot) ?? 0);
        this.content.add(label);
      }
    }

    this.refreshFrames();
    this.focus(null, true);
  }

  /** Frames the whole farm (null) or one greenhouse. */
  focus(greenhouseId: string | null, instant = false): void {
    const layout = this.layout;
    if (!layout) return;
    const gh =
      layout.greenhouses.length === 1
        ? layout.greenhouses[0]
        : layout.greenhouses.find((g) => g.id === greenhouseId);
    const center = new THREE.Vector3(gh?.x ?? 0, 0, gh?.z ?? 0);
    // Look from the side (+x) on portrait screens, so the greenhouses stack down
    // the screen. A single greenhouse is seen from whichever side lines its long
    // side up with the screen's; z then runs across the screen.
    const portrait = this.camera.aspect < 0.9;
    const across = gh ? gh.width : layout.width;
    const along = gh ? gh.depth : layout.depth;
    // Only clearly long greenhouses (like El Dorado) turn; near-square ones do not.
    const side = gh ? portrait !== along > across * 1.3 : portrait;
    const width = side ? along : across;
    const depth = side ? across : along;
    // Distance that fits the box in both directions of the field of view.
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distance =
      Math.max(width / 2 / Math.tan(hFov / 2), depth / 2 / Math.tan(vFov / 2)) * (gh ? 1.25 : 1.0) +
      depth / 2;
    const elevation = THREE.MathUtils.degToRad(portrait ? 62 : 55);
    const ground = Math.cos(elevation) * distance;
    const offset = side
      ? new THREE.Vector3(ground, Math.sin(elevation) * distance, 0)
      : new THREE.Vector3(0, Math.sin(elevation) * distance, ground);
    const position = center.clone().add(offset);

    // Greenhouse names go on the edge nearest the camera: front, or the end from the side.
    for (const { label, x, z, width: w, depth: d } of this.greenhouseLabels) {
      label.position.set(side ? x + w / 2 + 1.6 : x, 0.3, side ? z : z + d / 2 + 1.6);
    }

    if (instant || this.options.reducedMotion) {
      this.tween = null;
      this.camera.position.copy(position);
      this.controls.target.copy(center);
      this.controls.update();
      this.requestRender();
      return;
    }
    this.tween = {
      from: [this.camera.position.clone(), this.controls.target.clone()],
      to: [position, center],
      start: performance.now(),
    };
    this.requestRender();
  }

  /** Keeps a bed highlighted (e.g. while its card is open). */
  setSelected(lotId: string | null): void {
    this.selected = lotId;
    this.refreshFrames();
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.controls.dispose();
    this.clearContent();
    Object.values(this.frameMaterials).forEach((m) => m.dispose());
    this.assets.dispose();
    this.renderer.dispose();
    canvas.remove();
    this.labels.domElement.remove();
  }

  private setUpLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xfffdf6, 0x9c8a70, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.7);
    sun.position.set(-40, 70, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 70;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
  }

  /** Keeps the point the camera looks at over the farm, so it cannot drift away. */
  private keepInside(): void {
    if (!this.layout) return;
    const target = this.controls.target;
    const halfWidth = this.layout.width / 2;
    const halfDepth = this.layout.depth / 2;
    const x = THREE.MathUtils.clamp(target.x, -halfWidth, halfWidth);
    const z = THREE.MathUtils.clamp(target.z, -halfDepth, halfDepth);
    if (x === target.x && z === target.z && target.y === 0) return;
    const shift = new THREE.Vector3(x - target.x, -target.y, z - target.z);
    target.add(shift);
    this.camera.position.add(shift);
  }

  /** Thin border around a bed, shown for "today" and hover/selection. */
  private frame(x: number, z: number, width: number, depth: number): THREE.Group {
    const group = new THREE.Group();
    const t = 0.12;
    const unitBox = this.assets.geometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1));
    const w = width + 0.3;
    const d = depth + 0.3;
    const sides: [number, number, number, number][] = [
      [w, t, 0, -d / 2],
      [w, t, 0, d / 2],
      [t, d, -w / 2, 0],
      [t, d, w / 2, 0],
    ];
    for (const [sx, sz, px, pz] of sides) {
      const bar = new THREE.Mesh(unitBox, this.frameMaterials.today);
      bar.scale.set(sx, 0.06, sz);
      bar.position.set(px, 0.15, pz);
      group.add(bar);
    }
    group.position.set(x, 0, z);
    group.visible = false;
    return group;
  }

  private refreshFrames(): void {
    for (const [lotId, bed] of this.beds) {
      const active = lotId === this.hovered || lotId === this.selected;
      bed.frame.visible = active || bed.activity === 'today';
      const material = active ? this.frameMaterials.hover : this.frameMaterials.today;
      bed.frame.children.forEach((bar) => ((bar as THREE.Mesh).material = material));
    }
    this.requestRender();
  }

  private label(text: string, kind: string, x: number, y: number, z: number): CSS2DObject {
    const el = document.createElement('span');
    el.textContent = text;
    el.className = `farm-label farm-label-${kind.split(' ').join(' farm-label-')}`;
    const object = new CSS2DObject(el);
    object.position.set(x, y, z);
    return object;
  }

  private clearContent(): void {
    this.workers = [];
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.content.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
          materials.add(m),
        );
      }
      if (object instanceof CSS2DObject) object.element.remove();
    });
    // Shared assets and frame materials are freed in dispose(), not here.
    const shared = new Set<unknown>(Object.values(this.frameMaterials));
    geometries.forEach((g) => !this.assets.owns(g) && g.dispose());
    materials.forEach((m) => !shared.has(m) && !this.assets.owns(m) && m.dispose());
    this.content.clear();
    this.hitBoxes.length = 0;
    this.greenhouseLabels.length = 0;
    this.beds.clear();
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private requestRender(): void {
    if (!this.frameId) this.frameId = requestAnimationFrame(this.render);
  }

  private readonly render = (now: number): void => {
    this.frameId = 0;
    let animating = false;

    if (this.tween) {
      const t = Math.min(1, (now - this.tween.start) / 700);
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(this.tween.from[0], this.tween.to[0], k);
      this.controls.target.lerpVectors(this.tween.from[1], this.tween.to[1], k);
      if (t >= 1) this.tween = null;
      animating = true;
    }
    // Workers move all the time (still, posed, with reduced motion).
    if (this.workers.length && !this.options.reducedMotion) {
      for (const worker of this.workers) worker.update(now / 1000);
      animating = true;
    }
    // With damping, update() keeps returning true while the camera glides.
    if (this.controls.update()) animating = true;

    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    if (animating) this.requestRender();
  };

  private pick(event: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.hitBoxes, false)[0];
    return (hit?.object.userData['lotId'] as string | undefined) ?? null;
  }

  private local(event: PointerEvent): [number, number] {
    const rect = this.host.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || event.buttons) return;
    const lotId = this.pick(event);
    this.renderer.domElement.style.cursor = lotId ? 'pointer' : 'grab';
    if (lotId !== this.hovered) {
      this.hovered = lotId;
      this.refreshFrames();
    }
    this.options.onHover(lotId, ...this.local(event));
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.down = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.down;
    this.down = null;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE)
      return;
    this.options.onSelect(this.pick(event), ...this.local(event));
  };

  private readonly onPointerLeave = (): void => {
    if (this.hovered) {
      this.hovered = null;
      this.renderer.domElement.style.cursor = '';
      this.refreshFrames();
    }
    this.options.onHover(null, 0, 0);
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Adds a clock icon and "N d" to a stale lot's label (lucide "clock"). */
function appendStaleDays(el: HTMLElement, days: number): void {
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('class', 'farm-label-clock');
  for (const [tag, attrs] of [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 6v6l4 2' }],
  ] as const) {
    const shape = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => shape.setAttribute(key, value));
    icon.appendChild(shape);
  }
  const text = document.createElement('span');
  text.textContent = `${days} d`;
  el.append(icon, text);
}
