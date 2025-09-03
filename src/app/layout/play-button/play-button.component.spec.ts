import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PlayButtonComponent } from './play-button.component';

describe('PlayButtonComponent', () => {
  let component: PlayButtonComponent;
  let fixture: ComponentFixture<PlayButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayButtonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show help then hide after timeout (no compact)', fakeAsync(() => {
    component.onPlay();
    fixture.detectChanges();
    expect(component.showHelp).toBeTrue();
    expect(component.isCompact).toBeFalse(); // compact disabled
    tick(component.helpFullDuration + 10);
    fixture.detectChanges();
    expect(component.showHelp).toBeFalse();
    expect(component.isCompact).toBeFalse();
  }));
});
