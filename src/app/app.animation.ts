import { trigger, transition, query, style, animate, group } from '@angular/animations';

// This animation is used for route transitions (i.e. for routed content)
export const slideInAnimation = trigger('routeAnimations', [
  transition('* <=> *', [
    // Set entering and leaving elements to fixed position for smooth transitions
    query(':enter, :leave', [
      style({
        position: 'fixed',
        width: '100%'
      })
    ], { optional: true }),
    group([
      // Animate the entering element: start off-screen to the left and slide in
      query(':enter', [
        style({ transform: 'translateY(250%)' }),
        animate('0.2s ease-in-out', style({ transform: 'translateY(0%)' }))
      ], { optional: true }),
      // Animate the leaving element: slide out to the right
      query(':leave', [
        style({ transform: 'translateY(0%)' }),
        animate('0.2s ease-in-out', style({ transform: 'translateY(-100%)' }))
      ], { optional: true })
    ])
  ])
]);