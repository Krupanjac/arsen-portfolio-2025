import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { RailComponent } from '../layout/rail/rail.component';

interface WorkItem {
  link: string;
  img: string;
  alt: string;
}

@Component({
  selector: 'app-work',
  standalone: true,
  imports: [CommonModule, TranslateModule, RailComponent, TerminalTypingDirective],
  templateUrl: './work.component.html',
  styleUrls: ['./work.component.scss']
})
export class WorkComponent {
  // Static placeholders removed — populate this array from a service or content source instead.
  workItems: WorkItem[] = [];
}
