import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PlayStateService } from '../../play-state.service';

@Component({
  selector: 'app-play-button',
  imports: [TranslateModule],
  templateUrl: './play-button.component.html',
  styleUrl: './play-button.component.scss'
})
export class PlayButtonComponent {
  constructor(private playStateService: PlayStateService) {}

  onPlay() {
    this.playStateService.isPlaying = true;
  }
}
