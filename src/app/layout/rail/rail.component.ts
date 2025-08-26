import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-rail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rail.component.html',
  styleUrls: ['./rail.component.scss']
})
export class RailComponent {
  // Optional input to allow passing a class for the inner text
  // default: white on mobile, primary on sm+ (mobile-first Tailwind)
  @Input() textClass = 'text-xl whitespace-nowrap text-white sm:text-primary';
}
