import { Component } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- Add this line
import { TranslateModule } from '@ngx-translate/core';
import { RailComponent } from '../layout/rail/rail.component';

interface Project {
  link: string;
  img: string;
  alt: string;
}

@Component({
  selector: 'app-projects',
  standalone: true, // Standalone component
  imports: [CommonModule, TranslateModule, RailComponent], // <-- Add CommonModule here
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.scss']
})
export class ProjectsComponent {
  projects: Project[] = [
    { link: 'https://github.com/Krupanjac/SFML-2DMK', img: './projectImg/4.png', alt: 'Project 1' },
    { link: 'https://github.com/Krupanjac/SFML-snake-game', img: './projectImg/1.png', alt: 'Project 2' },
    { link: 'https://github.com/Krupanjac/SFML-flappy-bird', img: './projectImg/2.png', alt: 'Project 3' },
    { link: 'https://www.armasrbija.rs/', img: './projectImg/5.1.png', alt: 'Project 4' },
    { link: 'https://github.com/Krupanjac/BubbleSort-py', img: './projectImg/6.png', alt: 'Project 5' },
    // ... add the rest of your projects as needed.
  ];
}
