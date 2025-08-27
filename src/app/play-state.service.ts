import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PlayStateService {
  private _isPlaying = new BehaviorSubject<boolean>(false);
  isPlaying$ = this._isPlaying.asObservable();

  constructor() { }

  get isPlaying(): boolean {
    return this._isPlaying.value;
  }

  set isPlaying(value: boolean) {
    this._isPlaying.next(value);
  }
}
