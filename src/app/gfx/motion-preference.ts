/**
 * Whether the renderer animates.
 *
 * Anything that moves on its own for more than five seconds alongside other
 * content needs a way to pause it (WCAG 2.2.2). prefers-reduced-motion only
 * decides where that control starts: paused when the system asks for reduced
 * motion, playing otherwise. Once the visitor uses the control, their choice
 * wins, and it is remembered on this device.
 *
 * Only a choice that differs from the system's default is stored. Someone who
 * pauses and then plays again leaves nothing behind, so a later change to their
 * system setting still takes effect.
 */

import { REDUCED_MOTION_QUERY } from './render-loop';

export const MOTION_STORAGE_KEY = 'motion';

type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class MotionPreference {
  private systemReduced = false;
  private choice: boolean | null = null;
  private query: MediaQueryList | null = null;

  /**
   * @param onChange called whenever `enabled` flips, from the control or from
   *   a change of the system setting.
   * @param storage where the choice is kept; null keeps it for this page only.
   */
  constructor(
    private readonly onChange: (enabled: boolean) => void,
    private readonly storage: ChoiceStorage | null = browserStorage(),
  ) {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      this.systemReduced = query.matches;
      // Safari before 14 only has the deprecated listener API.
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', this.onSystemChange);
      } else {
        query.addListener(this.onSystemChange);
      }
      this.query = query;
    }
    this.choice = this.read();
  }

  /** True when the renderer should animate. */
  get enabled(): boolean {
    return this.choice ?? !this.systemReduced;
  }

  /** True when motion is off only because the system asks for reduced motion. */
  get heldBySystem(): boolean {
    return this.choice === null && this.systemReduced;
  }

  /** The visitor's choice. Remembered when it differs from the system's default. */
  set(enabled: boolean): void {
    const before = this.enabled;
    this.choice = enabled === !this.systemReduced ? null : enabled;
    this.write();
    if (this.enabled !== before) this.onChange(this.enabled);
  }

  toggle(): void {
    this.set(!this.enabled);
  }

  dispose(): void {
    const query = this.query;
    if (!query) return;
    if (typeof query.removeEventListener === 'function') {
      query.removeEventListener('change', this.onSystemChange);
    } else {
      query.removeListener(this.onSystemChange);
    }
    this.query = null;
  }

  private readonly onSystemChange = (event: MediaQueryListEvent): void => {
    const before = this.enabled;
    this.systemReduced = event.matches;
    if (this.enabled !== before) this.onChange(this.enabled);
  };

  private read(): boolean | null {
    try {
      const value = this.storage?.getItem(MOTION_STORAGE_KEY);
      return value === 'on' ? true : value === 'off' ? false : null;
    } catch {
      return null; // storage blocked: behave as if nothing was chosen
    }
  }

  private write(): void {
    try {
      if (this.choice === null) this.storage?.removeItem(MOTION_STORAGE_KEY);
      else this.storage?.setItem(MOTION_STORAGE_KEY, this.choice ? 'on' : 'off');
    } catch {
      // Storage blocked: the choice still holds until the page is closed.
    }
  }
}

function browserStorage(): ChoiceStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // reading the property itself throws where storage is blocked
  }
}
