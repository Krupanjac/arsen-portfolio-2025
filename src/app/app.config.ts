// app.config.ts (or main.ts)
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { appRoutes } from './app.routes';
import { ApplicationConfig} from '@angular/core';



export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes)
  ]
};


bootstrapApplication(AppComponent, {
  providers: [provideRouter(appRoutes)]
}).catch(err => console.error(err));
