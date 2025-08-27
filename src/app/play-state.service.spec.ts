import { TestBed } from '@angular/core/testing';

import { PlayStateService } from './play-state.service';

describe('PlayStateService', () => {
  let service: PlayStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PlayStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
