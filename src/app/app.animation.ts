// slide-in.animation.ts
import { trigger, transition, query, style, animate, group } from '@angular/animations';

export const slideInAnimation = trigger('routeAnimations', [
  transition('* <=> *', [
    // Set the entering and leaving elements to fixed position
    query(':enter, :leave', [
      style({
        position: 'fixed',
        width: '100%'
      })
    ], { optional: true }),
    group([
      // Animate the new component: start off-screen to the left, slide in
      query(':enter', [
        style({ transform: 'translateX(-100%)' }),
        animate('0.5s ease-out', style({ transform: 'translateX(0%)' }))
      ], { optional: true }),
      // Animate the old component: slide out to the right
      query(':leave', [
        style({ transform: 'translateX(0%)' }),
        animate('0.5s ease-out', style({ transform: 'translateX(100%)' }))
      ], { optional: true })
    ])
  ])
]);
