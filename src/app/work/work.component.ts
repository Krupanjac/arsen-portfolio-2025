import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface WorkItem {
  link: string;
  img: string;
  alt: string;
}

@Component({
  selector: 'app-work',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './work.component.html',
  styleUrls: ['./work.component.css']
})
export class WorkComponent {
  workItems: WorkItem[] = [
    { link: 'https://github.com/Krupanjac/SFML-2DMK', img: 'assets/ProjectImg/4.png', alt: 'Work 1' },
    { link: 'https://github.com/Krupanjac/SFML-snake-game', img: 'assets/ProjectImg/1.png', alt: 'Work 2' },
    { link: 'https://github.com/Krupanjac/SFML-flappy-bird', img: 'assets/ProjectImg/2.png', alt: 'Work 3' },
    // ... add more items as needed.
  ];
}
