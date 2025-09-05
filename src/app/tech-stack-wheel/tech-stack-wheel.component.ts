import { Component, signal, computed, ElementRef, ViewChild, ViewChildren, QueryList, AfterViewInit, OnDestroy, NgZone, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { TooltipDirective } from '../shared/tooltip.directive';
import { TranslateModule } from '@ngx-translate/core';

interface TechItem {
  key: string; // translation key suffix (e.g. C, CPP)
  icon: string; // id for switch matching
}

interface TechGroup {
  key: string;            // group key (e.g. LANGUAGES)
  labelKey: string;       // full translation key for label
  color: string;          // accent color (HSL / hex)
  items: TechItem[];
}
interface PhysicsBody {
  key: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number; // seconds since spawn
}

@Component({
  selector: 'app-tech-stack-wheel',
  standalone: true,
  imports: [CommonModule, TooltipDirective, TranslateModule],
  templateUrl: './tech-stack-wheel.component.html',
  styleUrls: ['./tech-stack-wheel.component.scss']
})

export class TechStackWheelComponent implements AfterViewInit, OnDestroy {
  // Data ------------------------------------------------------------------
  readonly groups: TechGroup[] = [
    {
      key: 'LANGUAGES',
      labelKey: 'HOME.STACK.GROUPS.LANGUAGES.TITLE',
      color: '#6366f1',
      items: [
        { key: 'C', icon: 'c' },
        { key: 'CPP', icon: 'cpp' },
        { key: 'PYTHON', icon: 'py' },
        { key: 'JAVA', icon: 'java' },
        { key: 'CSHARP', icon: 'csharp' },
        { key: 'PHP', icon: 'php' },
        { key: 'TYPESCRIPT', icon: 'ts' },
        { key: 'JAVASCRIPT', icon: 'js' },
        { key: 'SQL', icon: 'sql' }
      ]
    },
    {
      key: 'FRAMEWORKS',
      labelKey: 'HOME.STACK.GROUPS.FRAMEWORKS.TITLE',
      color: '#f59e0b',
      items: [
        { key: 'ANGULAR', icon: 'angular' },
        { key: 'NODE', icon: 'node' },
        { key: 'TAILWIND', icon: 'tailwind' }
      ]
    },
    {
      key: 'PLATFORM',
      labelKey: 'HOME.STACK.GROUPS.PLATFORM.TITLE',
      color: '#10b981',
      items: [
        { key: 'SQLITE', icon: 'sqlite' },
        { key: 'REL_SQL', icon: 'relational-sql' },
        { key: 'CLOUDFLARE', icon: 'cloudflare' },
        { key: 'AZURE', icon: 'azure' },
        { key: 'GCP', icon: 'gcp' },
        { key: 'LINUX', icon: 'linux' }
      ]
    },
    {
      key: 'TOOLING',
      labelKey: 'HOME.STACK.GROUPS.TOOLING.TITLE',
      color: '#8b5cf6',
      items: [
        { key: 'GIT', icon: 'git' },
        { key: 'PIPELINES', icon: 'pipelines' },
        { key: 'ALGO_DS', icon: 'algo-ds' },
        { key: 'DESIGN_PATTERNS', icon: 'design-patterns' }
      ]
    },
    {
      key: 'AI',
      labelKey: 'HOME.STACK.GROUPS.AI.TITLE',
      color: '#ec4899',
      items: [
        { key: 'PAIR', icon: 'ai-pair' },
        { key: 'LLM', icon: 'llm' },
        { key: 'OLLAMA', icon: 'ollama' }
      ]
    },
    {
      key: 'CREATIVE',
      labelKey: 'HOME.STACK.GROUPS.CREATIVE.TITLE',
      color: '#0ea5e9',
      items: [
        { key: 'PHOTO', icon: 'photo' },
        { key: 'VIDEO', icon: 'video' },
        { key: 'TERRAIN', icon: 'terrain' }
      ]
    }
  ];

  // Signals ----------------------------------------------------------------
  activeIndex = signal<number | null>(null);
  locked = signal(false); // user clicked to keep a group open

  // Precompute polar positions for group anchors
  groupPositions = computed(() => {
    const rPercent = 46; // slightly further out for smaller nodes
    const count = this.groups.length;
    return this.groups.map((g, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2; // start at top
      const x = 50 + Math.cos(angle) * rPercent;
      const y = 50 + Math.sin(angle) * rPercent;
      return { x, y, angleDeg: angle * (180 / Math.PI), group: g };
    });
  });

  // Items to show when active
  activeItems = computed(() => {
    const idx = this.activeIndex();
    if (idx == null) return [] as TechItem[];
    return this.groups[idx].items;
  });

  // Expose total groups for animation delays
  totalGroups = this.groups.length;

  // Physics -----------------------------------------------------------------
  @ViewChild('simStage') simStage?: ElementRef<HTMLDivElement>;
  @ViewChild('wheelRoot') wheelRoot?: ElementRef<HTMLDivElement>;
  @ViewChildren('simItem') simItems?: QueryList<ElementRef<HTMLButtonElement>>;
  private bodies: PhysicsBody[] = [];
  private rafId: number | null = null;
  private lastTime = 0;
  private stageRadius = 0;
  private isBrowser: boolean;
  private spawnWave = 0;
  private readonly BASE_MAX_SPEED = 140; // desktop baseline
  private readonly BASE_ITEM_RADIUS = 23;
  private readonly MOBILE_BREAKPOINT = 640; // px
  private mobileMode = false;
  private readonly resizeHandler = () => this.handleResize();
  private MAX_SPEED = this.BASE_MAX_SPEED;
  private readonly ITEM_RADIUS = 23; // half of item size (approx)
  private readonly SCALE_DURATION = 0.10; // faster scale animation
  private readonly START_SCALE = 0.15; // smaller initial scale for snap effect
  private readonly MIN_SPEED = 14; // px/sec floor so motion never fully stops
  private readonly SPAWN_SEPARATION_ITERATIONS = 12; // relaxation passes to resolve initial overlaps
  private readonly SPAWN_DISTRIBUTION_INNER = 0.18; // keep some near center

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef, @Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  select(i: number) {
    // Click locks/unlocks the group
    if (this.activeIndex() !== i) {
      this.activeIndex.set(i);
      this.locked.set(true);
  this.queueSpawn();
    } else {
      // Toggle lock off and collapse
      if (this.locked()) {
        this.locked.set(false);
        this.activeIndex.set(null);
      } else {
        this.locked.set(true);
      }
    }
  }

  hoverGroup(i: number) {
    if (this.locked()) return; // don't override locked selection
    this.activeIndex.set(i);
  // When hovering we create a new simulation state
  this.queueSpawn();
  }

  handleWheelLeave() {
    if (!this.locked()) this.activeIndex.set(null);
  }

  unlock() { this.locked.set(false); this.activeIndex.set(null); }

  get activeGroup() {
    const idx = this.activeIndex();
    return idx == null ? null : this.groups[idx];
  }

  getItemLabelKey(it: TechItem): string {
    // Prefer unified ITEMS list; fallback to group-specific key form
    const baseItemsKey = 'HOME.STACK.ITEMS.' + it.key;
    // Some keys exist only inside group buckets originally; fallback pattern
    // (We let template still attempt translation using | translate)
    return baseItemsKey;
  }

  // ---------------- Physics Engine -----------------
  ngAfterViewInit() {
    if (!this.isBrowser) return;
    // Start an observer to recalc radius on resize
  const RZ = (window as any).ResizeObserver;
  const ro = RZ ? new RZ(() => this.computeStageRadius()) : null;
    if (ro && this.simStage?.nativeElement) ro.observe(this.simStage.nativeElement);
    window.addEventListener('resize', this.resizeHandler, { passive: true });
    this.handleResize();
  }

  ngOnDestroy() {
    if (this.isBrowser) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.stopLoop();
  }

  private handleResize() {
    const w = window.innerWidth;
    const wasMobile = this.mobileMode;
    this.mobileMode = w <= this.MOBILE_BREAKPOINT;
    // Scale physics parameters for mobile for calmer motion & smaller circle
    this.MAX_SPEED = this.mobileMode ? this.BASE_MAX_SPEED * 0.75 : this.BASE_MAX_SPEED;
    // Recompute layout radius immediately
    this.computeStageRadius();
    if (wasMobile !== this.mobileMode) {
      // Re-spawn to reposition bodies for new radius
      this.queueSpawn();
    }
  this.clampBodiesToRadius();
  }

  private computeStageRadius() {
  const host = this.wheelRoot?.nativeElement || this.simStage?.nativeElement;
  if (!host) return;
  const rect = host.getBoundingClientRect();
  // Slight padding to avoid clipping
  this.stageRadius = Math.min(rect.width, rect.height) / 2 - this.ITEM_RADIUS - 2;
  }

  private queueSpawn() {
    // Defer spawn until view updates items
    setTimeout(() => this.spawnBodies(), 0);
  }

  private spawnBodies() {
    if (!this.isBrowser) return;
    this.computeStageRadius();
    const items = this.activeItems();
    if (!items.length) { this.bodies = []; this.stopLoop(); return; }
    this.spawnWave++;
    const wave = this.spawnWave; // local capture
    // If already have bodies and same count, just keep them
    if (this.bodies.length === items.length) return;
    const maxSpawnRadius = this.stageRadius - this.ITEM_RADIUS - 4;
    const placed: PhysicsBody[] = [];
    for (const it of items) {
      let x = 0, y = 0; let attempts = 0; let ok = false;
      while (attempts < 60) {
        // Biased radial distribution (some near center)
        const u = Math.random();
        const rBias = this.SPAWN_DISTRIBUTION_INNER + (1 - this.SPAWN_DISTRIBUTION_INNER) * Math.sqrt(u); // sqrt for area uniformity
        const r = rBias * maxSpawnRadius;
        const a = Math.random() * Math.PI * 2;
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
        ok = true;
        for (const b of placed) {
          const dx = x - b.x; const dy = y - b.y; const d2 = dx*dx + dy*dy;
          const min = (this.ITEM_RADIUS + b.r - 4); // small visual overlap margin
          if (d2 < min*min) { ok = false; break; }
        }
        if (ok) break;
        attempts++;
      }
      // Outward-ish initial velocity plus random tangential component
      const dist = Math.hypot(x, y) || 1;
      const nx = x / dist, ny = y / dist;
      const speedBase = 70 + Math.random()*40; // slightly higher initial energy
      const tangentialAngle = Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2;
      const tx = Math.cos(Math.atan2(ny, nx) + tangentialAngle);
      const ty = Math.sin(Math.atan2(ny, nx) + tangentialAngle);
      const mix = 0.65; // outward vs tangential mix
      const vx = (nx * mix + tx * (1-mix)) * speedBase;
      const vy = (ny * mix + ty * (1-mix)) * speedBase;
      placed.push({ key: it.key, x, y, vx, vy, r: this.ITEM_RADIUS, age: 0 });
    }
    this.bodies = placed;
    // Run several quick relaxation iterations to resolve residual overlaps
    this.initialSeparationRelax();
    this.startLoop();
    // Small stagger impulse after initial frame to ensure separation
    setTimeout(() => { if (wave === this.spawnWave) this.randomImpulse(); }, 160);
  }

  private initialSeparationRelax() {
    for (let iter=0; iter<this.SPAWN_SEPARATION_ITERATIONS; iter++) {
      for (let i=0;i<this.bodies.length;i++) {
        for (let j=i+1;j<this.bodies.length;j++) {
          const a = this.bodies[i];
          const b = this.bodies[j];
          const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy) || 0.0001;
          const minDist = a.r + b.r - 4;
          if (d < minDist) {
            const overlap = (minDist - d) / 2;
            const nx = dx / d; const ny = dy / d;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
          }
        }
      }
      // Clamp to boundary each pass
      const maxDist = this.stageRadius - this.ITEM_RADIUS;
      for (const body of this.bodies) {
        const d = Math.hypot(body.x, body.y);
        if (d > maxDist) {
          const s = maxDist / d;
          body.x *= s; body.y *= s;
        }
      }
    }
  }

  private randomImpulse() {
    this.bodies.forEach(b => {
      b.vx += (Math.random()*2-1) * 40;
      b.vy += (Math.random()*2-1) * 40;
    });
  }

  private clampBodiesToRadius() {
    const maxDist = this.stageRadius - this.ITEM_RADIUS;
    if (maxDist <= 0) return;
    for (const b of this.bodies) {
      const d = Math.hypot(b.x, b.y);
      if (d > maxDist && d > 0) {
        const s = maxDist / d;
        b.x *= s; b.y *= s;
      }
    }
  }

  private startLoop() {
    if (this.rafId != null) return;
    this.lastTime = performance.now();
    this.zone.runOutsideAngular(() => this.loop());
  }

  private stopLoop() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.035, (now - this.lastTime) / 1000); // clamp dt
    this.lastTime = now;
    if (!this.activeGroup || !this.simItems) return;
    this.updatePhysics(dt);
    // paint
    const els = this.simItems.toArray();
    for (let i=0;i<this.bodies.length && i<els.length;i++) {
      const b = this.bodies[i];
      const el = els[i].nativeElement;
  // scale factor (ease-out)
  const t = Math.min(1, b.age / this.SCALE_DURATION);
  const ease = 1 - Math.pow(1 - t, 3); // cubic ease out
  const s = this.START_SCALE + (1 - this.START_SCALE) * ease;
  el.style.transform = `translate(calc(50% + ${b.x}px), calc(50% + ${b.y}px)) translate(-50%, -50%) scale(${s})`;
    }
  };

  private updatePhysics(dt: number) {
    const bodies = this.bodies;
    const radiusBound = this.stageRadius;
    const drag = 0.995; // mild drag
    const agitation = 5; // gentle random energy (slightly higher to avoid stagnation)
    for (const b of bodies) {
      // age accumulation for scaling
      b.age += dt;
      // Add tiny random agitation so they keep moving
      b.vx += (Math.random()*2-1) * agitation * dt;
      b.vy += (Math.random()*2-1) * agitation * dt;
      // Cap speed
      const speed = Math.hypot(b.vx, b.vy);
  const max = this.MAX_SPEED;
      if (speed > max) { const s = max / speed; b.vx *= s; b.vy *= s; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Boundary bounce (circle)
      const dist = Math.hypot(b.x, b.y);
      const maxDist = radiusBound - b.r;
      if (dist > maxDist && dist>0) {
        const nx = b.x / dist;
        const ny = b.y / dist;
        // project inside
        b.x = nx * maxDist;
        b.y = ny * maxDist;
        // reflect velocity
        const dot = b.vx * nx + b.vy * ny;
        b.vx -= 2 * dot * nx;
        b.vy -= 2 * dot * ny;
        // dampen
        b.vx *= 0.9; b.vy *= 0.9;
      }
      // drag
      b.vx *= drag; b.vy *= drag;
      // Minimum speed floor so they never fully settle
      const newSpeed = Math.hypot(b.vx, b.vy);
      if (newSpeed < this.MIN_SPEED) {
        if (newSpeed === 0) {
          const a = Math.random()*Math.PI*2;
          b.vx = Math.cos(a) * this.MIN_SPEED;
          b.vy = Math.sin(a) * this.MIN_SPEED;
        } else {
          const scale = this.MIN_SPEED / (newSpeed || 1);
            b.vx *= scale; b.vy *= scale;
        }
      }
    }
    // Pair collisions (elastic, equal mass)
    for (let i=0;i<bodies.length;i++) {
      for (let j=i+1;j<bodies.length;j++) {
        const a = bodies[i], c = bodies[j];
        const dx = c.x - a.x; const dy = c.y - a.y; const d = Math.hypot(dx, dy);
        const minDist = a.r + c.r - 6; // allow some visual overlap margin
        if (d > 0 && d < minDist) {
          const nx = dx / d; const ny = dy / d;
            // separate
          const overlap = (minDist - d) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          c.x += nx * overlap; c.y += ny * overlap;
          // velocities along normal
          const avn = a.vx*nx + a.vy*ny;
          const cvn = c.vx*nx + c.vy*ny;
          // swap normal components
          const diff = cvn - avn;
          a.vx += diff * nx; a.vy += diff * ny;
          c.vx -= diff * nx; c.vy -= diff * ny;
          // tangential unchanged; slight damping
          a.vx *= 0.99; a.vy *= 0.99; c.vx *= 0.99; c.vy *= 0.99;
        }
      }
    }
  }
}
