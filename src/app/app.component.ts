import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { NavComponent } from './layout/nav/nav.component';
import { LoaderComponent } from './layout/loader/loader.component';
import { CommonModule } from '@angular/common';
import { slideInAnimation } from './app.animation';
import { HeroComponent } from "./layout/hero/hero.component";
import { TranslateModule } from '@ngx-translate/core';
import { ContactComponent } from './contact/contact.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NavComponent, LoaderComponent, CommonModule, HeroComponent, TranslateModule, ContactComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  animations: [slideInAnimation]
})
export class AppComponent implements OnInit {
  title = 'arsen-portfolio-2025';
  loading = true;
  private timerId: any = null;

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

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Listen to router events to show/hide the loader during navigation
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        // Generate a random delay between 100ms and 600ms
        const delay = Math.floor(Math.random() * 500) + 100;
        this.timerId = setTimeout(() => {
          this.loading = false;
        }, delay);
      } else {
        // On any other event, cancel any pending delay and show the loader immediately
        if (this.timerId) {
          clearTimeout(this.timerId);
          this.timerId = null;
        }
        this.loading = true;
      }
    });
  }

  // Used by the router animation trigger to determine the animation state
  prepareRoute(outlet: RouterOutlet) {
    return outlet && outlet.activatedRouteData && outlet.activatedRouteData['animation'];
  }
}
