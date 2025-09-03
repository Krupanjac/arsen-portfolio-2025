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

## Interactive Background Features

The background component now includes interactive gravity field creation that influences star movement:

### Gravity Field Mode
- **Toggle Gravity Mode**: Press `D` to enter/exit gravity field creation mode
- **Create Gravity Points**: In gravity mode, Shift+Click to start creating gravity points, move mouse to add points, Shift+Click again to stop
- **Clear Gravity Fields**: Press `C` to clear all gravity fields

### Text Gravity Fields
- **Add Text Fields**: Press `T` to open a prompt and enter text that will be converted to gravity points
- Text is rendered using canvas and converted to points that stars gravitate towards

### How It Works
- Stars naturally gravitate toward gravity points and text fields
- The gravity effect creates dynamic formations as stars move toward your invisible gravity fields
- Stars repel each other from longer distances to prevent clustering and maintain visual clarity
- Gravity fields fade out visually over time but retain their attractive force
- Long-range attraction ensures distant stars are drawn to your shapes
- Gravity fields are shown as subtle glowing indicators that fade with age
- All interactions experience alongside the existing mouse attraction and particle effects

### Controls Summary
- `D` - Toggle gravity field mode
- `C` - Clear all gravity fields
- `T` - Add text gravity field
- `S` - Add 20 random stars (in gravity mode only)
- `Shift+Click` - Start/stop continuous gravity point creation
- `Click` - Create particles (when not in gravity mode)

### Visual Feedback
- Gravity mode indicator in the top-left corner
- Subtle glowing circles show active gravity points
- Gravity field indicators fade out over time while maintaining attraction
- Stars will cluster and form shapes around your gravity fields from any distance
- Star repulsion prevents overcrowding and maintains line visibility

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
