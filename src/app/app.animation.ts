import { trigger, transition, query, style, animate } from '@angular/animations';

// Reveal animation that visually mimics a scroll-in by revealing the entering
// element from top to bottom using clip-path. Does not change layout or
// element positioning so native scrolling remains unaffected.
export const slideInAnimation = trigger('routeAnimations', [
  transition('* <=> *', [
    // Reveal the entering element from top to bottom
    query(':enter', [
      style({ opacity: 1, 'clip-path': 'inset(100% 0 0 0)' }),
      animate('360ms cubic-bezier(.22,.9,.28,1)', style({ 'clip-path': 'inset(0% 0 0 0)' }))
    ], { optional: true }),

    // Fade out leaving element slightly for a smooth handoff
    query(':leave', [
      animate('200ms ease-in', style({ opacity: 0 }))
    ], { optional: true })
  ])
]);