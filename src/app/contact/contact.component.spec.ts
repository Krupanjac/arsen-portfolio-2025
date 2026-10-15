import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { ContactComponent } from './contact.component';
import { provideTestDeps } from '../../testing/test-providers';

describe('ContactComponent', () => {
  let component: ContactComponent;
  let fixture: ComponentFixture<ContactComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactComponent],
      providers: [provideTestDeps()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContactComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('labels the email actions from the catalogs, with the address filled in (R8-6)', () => {
    // Deliberately unlike the real copy, so a hardcoded English label can't pass.
    TestBed.inject(TranslateService).setTranslation('en', {
      CONTACT: {
        COMPOSE_LABEL: 'compose → {{email}}',
        COPY_LABEL: 'copy → {{email}}',
      },
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.contact-cta')?.getAttribute('aria-label')).toBe(`compose → ${component.email}`);
    expect(el.querySelector('.contact-copy')?.getAttribute('aria-label')).toBe(`copy → ${component.email}`);
  });
});
