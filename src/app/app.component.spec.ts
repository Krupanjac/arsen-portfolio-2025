import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'arsen-portfolio-2025' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance as AppComponent;
    // The component exposes a title property; ensure it matches the project name
    expect((app as any).title).toEqual('arsen-portfolio-2025');
  });

  it('should render navigation and section components', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-nav')).toBeTruthy();
    expect(compiled.querySelector('app-home')).toBeTruthy();
    expect(compiled.querySelector('app-projects')).toBeTruthy();
    expect(compiled.querySelector('app-experience')).toBeTruthy();
    expect(compiled.querySelector('app-about')).toBeTruthy();
    expect(compiled.querySelector('app-contact')).toBeTruthy();
  });
});
