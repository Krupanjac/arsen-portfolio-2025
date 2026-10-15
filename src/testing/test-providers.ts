import { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

/**
 * Everything a component in this app expects from the root injector, test-safe:
 * translations (no loader, keys render as-is), HttpClient backed by HttpTestingController
 * (requests stay pending; nothing hits the network), an empty router and no-op animations.
 *
 * Usage: TestBed.configureTestingModule({ imports: [MyComponent], providers: [provideTestDeps()] })
 */
export function provideTestDeps(): Array<Provider | EnvironmentProviders> {
  return [
    provideTranslateService({ lang: 'en' }),
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
    provideNoopAnimations(),
  ];
}
