/**
 * Page background: a drifting survey map.
 *
 * Runs behind every section below the hero, where the terrain has been parked.
 * It carries the hero's contour motif down the page at a fraction of the cost:
 * eleven noise taps per pixel and no marching, rendered at reduced scale, so it
 * is cheaper than the CSS backdrop-filter on the nav.
 *
 * Output is premultiplied alpha over a transparent ground. The page's own
 * background colour shows through, which keeps the theme switch a CSS concern
 * rather than something this shader has to reproduce.
 */
export const CONTOUR_FIELD_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform vec2  uMouse;      // -1..1, smoothed
uniform float uScroll;     // page scroll in viewport heights, unbounded
uniform float uTheme;      // 0 = light, 1 = dark
uniform vec3  uInk;        // contour ink on low ground, linear (--gfx-ink)
uniform vec3  uInkAlt;     // contour ink on high ground, linear (--gfx-ink-alt)
uniform vec3  uGlow;       // relief tint, linear (--gfx-sky-glow)

void main() {
  vec2 frag = vUv * uResolution;
  vec2 uv = (frag - 0.5 * uResolution) / uResolution.y;

  // Domain. Scroll drives a slow parallax — the map moves at a fraction of
  // page speed, which is what makes it read as a layer behind the content
  // rather than a texture painted on it.
  vec2 p = uv * 2.6;
  p.y -= uScroll * 0.85;
  p += uMouse * 0.035;
  p += vec2(uTime * 0.011, uTime * 0.006);

  // One cheap warp pass gives the level sets the curl of real relief instead
  // of the concentric blobs plain value noise produces.
  vec2 warp = vec2(fbm(p * 0.7 + 3.1, 3), fbm(p * 0.7 - 1.7, 3)) - 0.5;
  float h = fbm(p + warp * 0.9, 5);

  // Contours as level sets. fwidth() is safe here: no branches above it.
  const float LEVELS = 14.0;
  float e = h * LEVELS;
  float w = max(fwidth(e), 1e-4);
  float d = min(fract(e), 1.0 - fract(e));
  float line = 1.0 - smoothstep(0.0, w * 1.15, d - w * 0.1);

  // Every fifth level is an index contour, drawn heavier — the convention on
  // an actual topographic sheet.
  float idx = floor(e + 0.5);
  float isMajor = step(mod(idx, 5.0), 0.5);
  line *= mix(0.5, 1.0, isMajor);

  // Readability mask. The reading column sits left of centre; the map goes
  // quiet there and fills in toward the edges. Legible copy beats a pretty map.
  float column = 1.0 - smoothstep(0.32, 0.72, abs(uv.x + 0.14) * 1.15);
  float mask = mix(1.0, 0.42, column);

  // A touch of relief tint on high ground so the sheet has surface, not just
  // ink. Dark theme only — on white it just looks like a stain.
  float relief = smoothstep(0.38, 0.78, h) * 0.075 * uTheme;

  // Hypsometric ink: the level sets shift from the accent on low ground to the
  // rose on high ground, the way a relief map tints by elevation. Pulled a
  // fifth of the way to a neutral so the map stays behind the copy. Mixed in
  // linear and converted once: a conversion per palette colour per pixel cost
  // this pass a tenth of its budget.
  vec3 ink = linearToSRGB(mix(uInk, uInkAlt, smoothstep(0.32, 0.72, h)));
  vec3 neutral = mix(vec3(0.22, 0.24, 0.32), vec3(0.62, 0.65, 0.76), uTheme);
  ink = mix(neutral, ink, 0.8);
  vec3 reliefCol = mix(vec3(1.0), linearToSRGB(uGlow), 0.45);

  float aLine   = line * mask * mix(0.19, 0.21, uTheme);
  float aRelief = relief * mask;

  // Premultiplied: colour already scaled by coverage.
  vec3  col = ink * aLine + reliefCol * aRelief;
  float a   = aLine + aRelief * (1.0 - aLine);

  col = max(dither(col, frag), 0.0);
  fragColor = vec4(col, a);
}
`;
