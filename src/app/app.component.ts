import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header/header.component';
import { LoaderComponent } from './layout/loader/loader.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [HeaderComponent, LoaderComponent, CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  loading = true;
  private timerId: any = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Listen to router events to show/hide the loader during navigation
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        // Generate a random delay between 500ms and 1500ms
        const delay = Math.floor(Math.random() * 1000) + 500;
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
}
