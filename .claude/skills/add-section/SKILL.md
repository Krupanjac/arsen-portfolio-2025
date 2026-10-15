---
name: add-section
description: Add a new section to the portfolio's one-page layout, as a content block with its own anchor and nav entry. Use this instead of adding a route; the app has no router outlet.
---

# Add a section to the page

The site is one scrolling page. Its sections are listed in `src/app/app.component.html`. There's no `<router-outlet>`, so a new route would render nothing (ROADMAP BUG-2).

## Steps

1. **Generate the component.** Run `npx ng generate component <name>`. It's standalone with SCSS by default, and creates `src/app/<name>/`.
2. **Reuse the section layout**, a rail column plus centred content, copied from `experience.component.html`:

   ```html
   <div class="grid min-h-screen grid-cols-1 md:grid-cols-[20%_1fr] items-stretch">
     <div class="md:hidden pt-14 px-4 pb-2 border-b border-divider">
       <p class="text-base font-semibold uppercase tracking-widest text-secondary select-none">
         <span appTerminalTyping data-i18n-key="NAME.LABEL">{{ 'NAME.LABEL' | translate }}</span>
       </p>
     </div>
     <app-rail class="self-stretch" [textClass]="'text-xl whitespace-nowrap uppercase tracking-widest text-secondary select-none'">
       <span appTerminalTyping data-i18n-key="NAME.LABEL">{{ 'NAME.LABEL' | translate }}</span>
     </app-rail>
     <div class="flex justify-center items-start py-10 md:-ml-[20%] pl-4">
       <div class="w-[92%] sm:w-[80%] md:w-[70%] lg:w-[60%] mx-auto">
         <!-- content -->
       </div>
     </div>
   </div>
   ```

   The component needs `CommonModule`, `TranslateModule`, `RailComponent` and `TerminalTypingDirective` in its `imports`.
3. **Mount it** in `app.component.html`, in page order, and add the component to `AppComponent`'s `imports`:

   ```html
   <section id="name" class="min-h-screen" *ngIf="!playState.isPlaying">
     <app-name></app-name>
   </section>
   ```

   The nav's scroll-spy picks up every `section[id]` automatically. The `*ngIf` hides the section in play mode.
4. **Add the nav entries** in `layout/nav/nav.component.html`, in both the desktop `<nav>` and the mobile dropdown, in page order:
   - desktop: `(click)="onNavigate($event, 'name')"` plus `[attr.aria-current]`;
   - mobile: `onNavigateMobile`;
   - label key `NAV.NAME`. Nav labels end in `/`.
5. **Add the copy:** `NAME.LABEL` (the rail label, ending in `/` or `/>`), `NAV.NAME`, and the content keys. Follow the `i18n-copy` playbook.
6. **Keep it SSR-safe.** Put browser APIs behind `isPlatformBrowser`. Fetch `/api` data in the browser only, as `ProjectsComponent.ngOnInit` does.
7. **Style with the working helpers:** `text-primary`, `text-secondary`, `text-accent`, `bg-surface`, `border-divider`. Token utilities like `bg-accent` don't exist yet (BUG-1).
8. **Fix the spec:** add `providers: [provideTestDeps()]` (from `src/testing/test-providers.ts`) to the generated spec.
9. **Update the docs:** add a row to the "Page composition" table in `docs/ARCHITECTURE.md`.

## Verify

- `npm run verify` passes.
- In the Preview:
  - the nav highlights the new section while you scroll, and its link scrolls to it;
  - it looks right in dark and light, in EN and SR, at ~375 px and at desktop width;
  - play mode still hides it.
