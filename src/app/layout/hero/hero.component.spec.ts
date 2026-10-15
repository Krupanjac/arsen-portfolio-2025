import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HeroComponent } from './hero.component';
import { provideTestDeps } from '../../../testing/test-providers';

/** Answers the reduced-motion media query with `reduce`; every other query goes to the browser. */
function fakeReducedMotion(reduce: boolean): void {
  const real = window.matchMedia.bind(window);
  spyOn(window, 'matchMedia').and.callFake((query: string) =>
    query.includes('prefers-reduced-motion')
      ? ({
          matches: reduce,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList)
      : real(query),
  );
}

describe('HeroComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroComponent],
      providers: [provideTestDeps()]
    })
    .compileComponents();
  });

  function create(): ComponentFixture<HeroComponent> {
    const fixture = TestBed.createComponent(HeroComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('should create', () => {
    expect(create().componentInstance).toBeTruthy();
  });

  it('gives the heading a stable accessible name and hides the scrambled copy (R8-6)', () => {
    const h1: HTMLElement = create().nativeElement.querySelector('h1');
    expect(h1.querySelector('.sr-only')?.textContent?.trim()).toBe('Arsen Đurđev');
    expect(h1.querySelector('#su_full')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('labels the social links as a group, from the catalogs (R8-6)', () => {
    const group: HTMLElement = create().nativeElement.querySelector('.hero-socials');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('HERO.SOCIAL_LABEL');
  });

  it('labels the scroll cue from the catalogs (R8-6)', () => {
    const cue: HTMLElement = create().nativeElement.querySelector('.hero-scroll');
    expect(cue.getAttribute('aria-label')).toBe('HERO.SCROLL_LABEL');
  });

  it('scrambles the name when motion is welcome', () => {
    fakeReducedMotion(false);
    const intervals = spyOn(window, 'setInterval').and.callThrough();
    create();
    expect(intervals).toHaveBeenCalledWith(jasmine.any(Function), 2600);
  });

  it('never starts the name scramble under reduced motion (R8-4)', () => {
    fakeReducedMotion(true);
    const intervals = spyOn(window, 'setInterval').and.callThrough();
    create();
    expect(intervals).not.toHaveBeenCalledWith(jasmine.any(Function), 2600);
  });
});
