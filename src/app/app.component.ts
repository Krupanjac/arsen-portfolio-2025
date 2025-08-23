import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
// Router imports removed because loader now depends on actual page load rather than navigation events.
import { NavComponent } from './layout/nav/nav.component';
import { LoaderComponent } from './layout/loader/loader.component';
import { CommonModule } from '@angular/common';
import { slideInAnimation } from './app.animation';
import { HeroComponent } from "./layout/hero/hero.component";
import { RailComponent } from './layout/rail/rail.component';
import { TranslateModule } from '@ngx-translate/core';
import { ContactComponent } from './contact/contact.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NavComponent, LoaderComponent, CommonModule, HeroComponent, TranslateModule, ContactComponent, RailComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  animations: [slideInAnimation]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'arsen-portfolio-2025';
  loading = true;
  private loadListenerBound = this.onWindowLoad.bind(this);
  private fallbackTimeoutId: any = null;

  // Minimal local data for the inlined templates
  projects = [
    { link: 'https://github.com/Krupanjac/SFML-2DMK', img: './projectImg/4.png', alt: 'Project 1' },
    { link: 'https://github.com/Krupanjac/SFML-snake-game', img: './projectImg/1.png', alt: 'Project 2' },
    { link: 'https://github.com/Krupanjac/SFML-flappy-bird', img: './projectImg/2.png', alt: 'Project 3' },
    { link: 'https://www.armasrbija.rs/', img: './projectImg/5.1.png', alt: 'Project 4' },
    { link: 'https://github.com/Krupanjac/BubbleSort-py', img: './projectImg/6.png', alt: 'Project 5' }
  ];

  workItems = [
    { link: 'https://github.com/Krupanjac/SFML-2DMK', img: 'assets/ProjectImg/4.png', alt: 'Work 1' },
    { link: 'https://github.com/Krupanjac/SFML-snake-game', img: 'assets/ProjectImg/1.png', alt: 'Work 2' },
    { link: 'https://github.com/Krupanjac/SFML-flappy-bird', img: 'assets/ProjectImg/2.png', alt: 'Work 3' }
  ];

  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
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

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('load', this.loadListenerBound);
    }
    if (this.fallbackTimeoutId) {
      clearTimeout(this.fallbackTimeoutId);
    }
  }
}
