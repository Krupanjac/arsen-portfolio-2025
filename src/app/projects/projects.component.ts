import { Component } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- Add this line

interface Project {
  link: string;
  img: string;
  alt: string;
}

@Component({
  selector: 'app-projects',
  standalone: true, // Standalone component
  imports: [CommonModule], // <-- Add CommonModule here
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.css']
})
export class ProjectsComponent {
  projects: Project[] = [
    { link: 'https://github.com/Krupanjac/SFML-2DMK', img: 'assets/ProjectImg/4.png', alt: 'Project 1' },
    { link: 'https://github.com/Krupanjac/SFML-snake-game', img: 'assets/ProjectImg/1.png', alt: 'Project 2' },
    { link: 'https://github.com/Krupanjac/SFML-flappy-bird', img: 'assets/ProjectImg/2.png', alt: 'Project 3' },
    { link: 'https://www.armasrbija.rs/', img: 'assets/ProjectImg/5.1.png', alt: 'Project 4' },
    { link: 'https://github.com/Krupanjac/BubbleSort-py', img: 'assets/ProjectImg/6.png', alt: 'Project 5' },
    // ... add the rest of your projects as needed.
  ];
}
