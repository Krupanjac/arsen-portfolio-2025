import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';

import { NavComponent } from './nav.component';
import { provideTestDeps } from '../../../testing/test-providers';

/** Translation keys render as-is in tests, so a translated label looks like this. */
const KEY = /^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)+$/;

describe('NavComponent', () => {
  let component: NavComponent;
  let fixture: ComponentFixture<NavComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavComponent],
      providers: [provideTestDeps()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lists the sections in page order, the same on desktop and mobile (BUG-9)', () => {
    // Page order (app.component.html): #start, #home, #resume, #experience,
    // #projects, #about, #contact. Home and the resume bridge have no link.
    const order = ['start', 'experience', 'projects', 'about', 'contact'];
    const el: HTMLElement = fixture.nativeElement;

    const desktop = Array.from(el.querySelectorAll('.nav__links a')).map((a) => a.getAttribute('href'));
    expect(desktop).toEqual(order.map((id) => `#${id}`));

    component.isNavOpen = true;
    fixture.detectChanges();
    const mobile = Array.from(el.querySelectorAll('#mobile-nav a')).map((a) => a.textContent?.trim());
    expect(mobile).toEqual(order.map((id) => `NAV.${id.toUpperCase()}`));
  });

  it('takes every aria-label and title from the catalogs (R8-6)', () => {
    component.isNavOpen = true;
    fixture.detectChanges();
    const labelled = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[aria-label], [title]'));
    expect(labelled.length).toBeGreaterThan(0);
    for (const el of labelled) {
      for (const attr of ['aria-label', 'title']) {
        const value = el.getAttribute(attr);
        if (value) expect(value).withContext(`${el.tagName} ${attr}`).toMatch(KEY);
      }
    }
  });

  it('registers its scroll listener outside the Angular zone (R8-7)', () => {
    const zones: boolean[] = [];
    const add = window.addEventListener.bind(window);
    spyOn(window, 'addEventListener').and.callFake(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === 'scroll') zones.push(NgZone.isInAngularZone());
      add(type, listener, options);
    }) as typeof window.addEventListener);

    TestBed.createComponent(NavComponent).detectChanges();
    expect(zones).toEqual([false]);
  });

  it('re-enters the zone only when the backdrop has to change (R8-7)', () => {
    const scrollY = spyOnProperty(window, 'scrollY').and.returnValue(0);
    window.dispatchEvent(new Event('scroll'));
    const run = spyOn(TestBed.inject(NgZone), 'run').and.callThrough();

    window.dispatchEvent(new Event('scroll'));
    expect(run).not.toHaveBeenCalled();

    scrollY.and.returnValue(100);
    window.dispatchEvent(new Event('scroll'));
    expect(run).toHaveBeenCalled();
    expect(component.scrolled).toBeTrue();

    // Further scrolling past the threshold changes nothing, so stays outside.
    run.calls.reset();
    scrollY.and.returnValue(400);
    window.dispatchEvent(new Event('scroll'));
    expect(run).not.toHaveBeenCalled();
  });
});
