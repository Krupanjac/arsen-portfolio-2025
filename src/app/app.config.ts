
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { ApplicationConfig} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';


export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes),
    provideAnimations()
  ]
};