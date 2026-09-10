# ArsenPortfolio2025

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.1.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

## Renderer

The hero is a WebGL2 raymarched terrain (`src/app/gfx/`), with a live frame-time HUD that reads from the same timer that drives its dynamic resolution scaling. Below the hero, a cheaper contour-field shader runs behind the content sections; the terrain is parked once it scrolls out of view.

### Fullscreen mode

The **Fullscreen renderer** control under the tech stack hides the page and leaves the renderer and HUD.

- Move the pointer to look around
- `1` / `2` / `3` — pin internal resolution at 50 / 75 / 100%
- `A` — hand resolution back to the dynamic scaler
- Click the HUD readout to expand GPU time, p95 and fill rate
- `Esc` — leave fullscreen

### Structure

- `gfx/gl-context.ts` — context acquisition and capability probe
- `gfx/shader.ts` — compile/link with the failing source line annotated
- `gfx/frame-timer.ts` — CPU time, GPU time via `EXT_disjoint_timer_query_webgl2`, p95 over a ring buffer
- `gfx/resolution-scaler.ts` — asymmetric dynamic resolution with cooldown
- `gfx/render-loop.ts` — rAF driver with visibility and occlusion gating
- `gfx/shader-surface.ts` — a full-canvas fragment pass with the above wired in
- `gfx/shaders/` — `common.glsl.ts` (noise, fBm, ACES), `hero-terrain.frag.ts`, `contour-field.frag.ts`

Shaders can be compiled and rendered outside the app for review; see the `hero-terrain.frag.ts` header for the cost controls.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
