import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
// Router imports removed because loader now depends on actual page load rather than navigation events.
import { NavComponent } from './layout/nav/nav.component';
import { LoaderComponent } from './layout/loader/loader.component';
import { CommonModule } from '@angular/common';
import { slideInAnimation } from './app.animation';
import { HeroComponent } from "./layout/hero/hero.component";
import { TranslateModule } from '@ngx-translate/core';
import { ContactComponent } from './contact/contact.component';
import { HomeComponent } from './home/home.component';
import { ProjectsComponent } from './projects/projects.component';
import { WorkComponent } from './work/work.component';
import { AboutComponent } from './about/about.component';
import { PlayStateService } from './play-state.service';
import { PlayButtonComponent } from './layout/play-button/play-button.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NavComponent,
    LoaderComponent,
    CommonModule,
    HeroComponent,
    TranslateModule,
    ContactComponent,
    HomeComponent,
    ProjectsComponent,
    WorkComponent,
  AboutComponent,
  PlayButtonComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [slideInAnimation]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'arsen-portfolio-2025';
  loading = true;
  private loadListenerBound = this.onWindowLoad.bind(this);
  private fallbackTimeoutId: any = null;

  // Data moved into respective standalone components (Home, Projects, Work, About, Contact)

  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object, private playStateService: PlayStateService) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  get playState(): PlayStateService {
    return this.playStateService;
  }

  ngOnInit(): void {
    // If the document already finished loading (e.g. from cache), hide the loader immediately.
    if (!this.isBrowser) {
      // On the server just disable the loader immediately.
      this.loading = false;
      return;
    }
    try {
      if (document.readyState === 'complete') {
        this.loading = false;
      } else {
        window.addEventListener('load', this.loadListenerBound, { once: true });
        this.fallbackTimeoutId = setTimeout(() => {
          if (this.loading) {
            this.loading = false;
          }
        }, 10000);
      }
    } catch {
      // In any unexpected environment, fail open (hide loader).
      this.loading = false;
    }
  }

  private onWindowLoad() {
    this.loading = false;
    if (this.fallbackTimeoutId) {
      clearTimeout(this.fallbackTimeoutId);
      this.fallbackTimeoutId = null;
    }
  }

  stopPlaying() {
    this.playStateService.isPlaying = false;
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('load', this.loadListenerBound);
    }
    if (this.fallbackTimeoutId) {
      clearTimeout(this.fallbackTimeoutId);
    }
  }
}
