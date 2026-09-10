import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PlayStateService } from '../../play-state.service';
import { TerminalTypingDirective } from '../../shared/terminal-typing.directive';
import { TooltipDirective } from '../../shared/tooltip.directive';

@Component({
  selector: 'app-play-button',
  imports: [CommonModule, TranslateModule, TerminalTypingDirective, TooltipDirective],
  templateUrl: './play-button.component.html',
  styleUrl: './play-button.component.scss'
})
export class PlayButtonComponent implements OnDestroy {
  /** Duration (ms) the full help stays before disappearing */
  readonly helpFullDuration = 3000; // extended to 3s per latest requirement
  showHelp = false;        // help container visible
  isCompact = false;       // compact vs full layout (unused now, left for potential future revert)
  private helpTimer: ReturnType<typeof setTimeout> | null = null;

  // Order determines display order in template
  // The star-field controls (D/C/S, shift-click) went with the star field;
  // fullscreen mode is the terrain renderer now, and these are its controls.
  readonly commandKeys: Array<{ key: string; label: string }> = [
    { key: 'MOUSE', label: 'HELP.COMMANDS.MOUSE' },
    { key: '1 / 2 / 3', label: 'HELP.COMMANDS.SCALE' },
    { key: 'A', label: 'HELP.COMMANDS.AUTO' },
    { key: 'HUD', label: 'HELP.COMMANDS.HUD' },
    { key: 'ESC', label: 'HELP.COMMANDS.ESC' }
  ];

  constructor(public playStateService: PlayStateService) {}

  onPlay() {
    this.playStateService.isPlaying = true;
  // Show full help only
  this.isCompact = false; // ensure not compact
  this.showHelp = true;
    if (this.helpTimer) {
      clearTimeout(this.helpTimer);
    }
    this.helpTimer = setTimeout(() => {
      // Instead of transitioning to compact, just hide it now
      this.showHelp = false;
      // this.isCompact = true; // (compact disabled by request)
    }, this.helpFullDuration);
  }

  ngOnDestroy(): void {
    if (this.helpTimer) {
      clearTimeout(this.helpTimer);
    }
  }
}
