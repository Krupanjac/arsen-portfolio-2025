import { Component } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- Add this line
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { RailComponent } from '../layout/rail/rail.component';

interface Project {
  link: string;
  img: string;
  alt: string;
}

@Component({
  selector: 'app-projects',
  standalone: true, // Standalone component
  imports: [CommonModule, TranslateModule, RailComponent, TerminalTypingDirective], // <-- Add CommonModule here
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.scss']
})
export class ProjectsComponent {
  // Static placeholders removed — populate this array from a service or content source instead.
  projects: Project[] = [];
}
