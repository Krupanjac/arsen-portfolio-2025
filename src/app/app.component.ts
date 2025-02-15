import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { NavComponent } from './layout/nav/nav.component';
import { LoaderComponent } from './layout/loader/loader.component';
import { CommonModule } from '@angular/common';
import { slideInAnimation } from './app.animation';
import { HomeComponent } from "./layout/home/home.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NavComponent, LoaderComponent, CommonModule, RouterOutlet, HomeComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  animations: [slideInAnimation]
})
export class AppComponent implements OnInit {
  loading = true;
  private timerId: any = null;

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
