//default HomeComponent impl
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { RailComponent } from '../layout/rail/rail.component';
import { TechStackWheelComponent } from './tech-stack-wheel/tech-stack-wheel.component';

interface Capability {
  index: string;
  titleKey: string;
  bodyKey: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule, RailComponent, TerminalTypingDirective, TechStackWheelComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})

export class HomeComponent {
  title = 'Home';

  /**
   * The three things the rest of the page is evidence for. Ordered — rendering
   * is the discipline, the pipeline is where it gets applied, the tooling is
   * what makes the first two repeatable — so the numeric markers are honest.
   */
  readonly capabilities: Capability[] = [
    { index: '01', titleKey: 'HOME.CAP.RENDER.TITLE', bodyKey: 'HOME.CAP.RENDER.BODY' },
    { index: '02', titleKey: 'HOME.CAP.TERRAIN.TITLE', bodyKey: 'HOME.CAP.TERRAIN.BODY' },
    { index: '03', titleKey: 'HOME.CAP.SYSTEMS.TITLE', bodyKey: 'HOME.CAP.SYSTEMS.BODY' },
  ];
}