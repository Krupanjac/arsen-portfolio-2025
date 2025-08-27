//default HomeComponent impl
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TerminalTypingDirective } from '../shared/terminal-typing.directive';
import { RailComponent } from '../layout/rail/rail.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule, RailComponent, TerminalTypingDirective],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})

export class HomeComponent {
  title = 'Home';
}