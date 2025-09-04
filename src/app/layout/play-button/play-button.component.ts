import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PlayStateService } from '../../play-state.service';
import { TerminalTypingDirective } from '../../shared/terminal-typing.directive';

@Component({
  selector: 'app-play-button',
  imports: [CommonModule, TranslateModule, TerminalTypingDirective],
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
  readonly commandKeys: Array<{ key: string; label: string }> = [
    { key: 'D', label: 'HELP.COMMANDS.D' },
    { key: 'C', label: 'HELP.COMMANDS.C' },
    { key: 'S', label: 'HELP.COMMANDS.S' },
    { key: 'CLICK', label: 'HELP.COMMANDS.CLICK' },
    { key: 'SHIFT_CLICK', label: 'HELP.COMMANDS.SHIFT_CLICK' }
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
