
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';


export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes),
    provideAnimations(),
  provideHttpClient(withFetch(), withInterceptorsFromDi()),
  ...provideTranslateService({ lang: 'en' }),
    ...provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' })
  ]
};