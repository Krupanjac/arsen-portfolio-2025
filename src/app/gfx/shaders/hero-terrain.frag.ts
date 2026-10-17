/**
 * Hero scene: a raymarched, eroded heightfield.
 *
 * Chosen because it is the honest version of the day job — an OSM-derived
 * terrain pipeline rendered the way the real one is, with the same problems
 * (LOD, silhouette cost, fog as a horizon budget) rather than an abstract
 * gradient that happens to run on the GPU.
 *
 * Every colour comes from the --gfx-* tokens in src/styles.scss (via
 * gfx/palette.ts), so the scene and the page share one palette. Two lighting
 * conditions, selected by uTheme and blended with mix() rather than branched:
 * a violet-hour dusk for the dark theme, a pastel dawn for the light one.
 * They are separate scenes, not one scene with a filter over it — the first
 * attempt post-processed the dusk render toward white for light mode and the
 * result was a flat grey field with no terrain left in it.
 *
 * Where the colour comes from, most to least: the sky's azimuth gradient
 * (warm toward the sun, cool away), the water that mirrors it, the warm key
 * against the cool sky fill, then the strata and the contour ink.
 *
 * Cost control, in order of how much it matters:
 *   - Step count and octave count both scale off uQuality, which the dynamic
 *     resolution scaler drives. At full quality a height query costs 8 noise
 *     taps (7 octaves plus the warp/crest tap), the same as the original field.
 *   - The height function used by the shadow, mist and shoreline queries is a
 *     3-octave stand-in, not the full field. Shadows do not need the detail
 *     and the silhouette they cast is identical at this scale.
 *   - Sky is evaluated analytically, never marched; reflections and fog reuse
 *     it without the cloud deck.
 *   - uTheme is a uniform, so every mix() against it is scalar-uniform and the
 *     wave never diverges.
 */
export const HERO_TERRAIN_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform vec2  uMouse;      // -1..1, already smoothed on the CPU
uniform float uScroll;     // 0..1 through the hero
uniform float uQuality;    // 0..1
uniform float uTheme;      // 0 = light/dawn, 1 = dark/dusk

// Palette, linear space, from the --gfx-* tokens (gfx/palette.ts).
uniform vec3 uZenith;      // sky overhead
uniform vec3 uHorizon;     // horizon haze away from the sun
uniform vec3 uGlow;        // horizon glow toward the sun; rim and bounce light
uniform vec3 uSun;         // sun disk and key light
uniform vec3 uRockLow;     // valley rock
uniform vec3 uRockHigh;    // ridge rock
uniform vec3 uStrata;      // sediment bands on the steep faces
uniform vec3 uMist;        // valley mist
uniform vec3 uInk;         // contour lines, low ground
uniform vec3 uInkAlt;      // contour lines, high ground

// ------------------------------------------------------------- the field ---

const float TERRAIN_SCALE  = 0.055;
const float TERRAIN_HEIGHT = 13.0;
// Floods the lowest valleys. High enough to catch a lake in most frames, low
// enough that the ridges the scene is about stay dry.
const float WATER_LEVEL    = 3.0;

// Every height query goes through here so the camera, the march and the
// shadows agree on one silhouette; only the octave count differs.
float terrainHeight(vec2 p, int octaves) {
  vec2 q = p * TERRAIN_SCALE;
  // One broad tap does two jobs. Its gradient bends the ranges — a cheap domain
  // warp, so ridgelines curve like geology instead of following the noise
  // lattice — and the level set through its midpoint becomes a crest line,
  // which gives the far silhouettes the sharp ridges eroded fBm alone lacks.
  vec3 w = noised(q * 0.31 + vec2(4.7, -1.9));
  q += w.yz * 0.22;
  float crest = 1.0 - abs(w.x * 2.0 - 1.0);
  return (fbmEroded(q, octaves) + crest * crest * 0.24) * TERRAIN_HEIGHT;
}

// Octaves follow the quality the resolution scaler drives: 5 when it is
// struggling, 7 when there is headroom. The march evaluates this up to 150
// times a pixel, so octaves are the biggest lever after the step count. The
// ceiling is 7, not 8, to pay for the warp/crest tap: an eighth octave is
// ~0.05 units of relief, sub-pixel past the foreground, and with it the open
// vistas benched 15% over the original field.
float terrainDetail(vec2 p) {
  return terrainHeight(p, int(mix(5.0, 7.0, uQuality) + 0.5));
}

// Camera placement only, where the extra octaves buy nothing.
float terrainMedium(vec2 p) {
  return terrainHeight(p, 6);
}

// Coarse stand-in for shadow, mist and shoreline queries — same silhouette, a
// third of the taps. Anything finer is invisible once it is a shadow.
float terrainCoarse(vec2 p) {
  return terrainHeight(p, 3);
}

// -------------------------------------------------------------- marching ---

float marchTerrain(vec3 ro, vec3 rd, float tmax, int steps) {
  float t = 0.6;
  for (int i = 0; i < 160; i++) {
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    float h = p.y - terrainDetail(p.xz);
    // Hit threshold widens with distance: one screen pixel subtends more world
    // space further out, so converging tighter than that is wasted work.
    if (h < 0.0018 * t) return t;
    if (t > tmax) break;
    // 0.42 rather than a full h: the height field is not a true distance
    // field, so a full step overshoots on steep slopes and punches holes in
    // the silhouette.
    t += max(0.42 * h, 0.0035 * t);
  }
  return -1.0;
}

vec3 terrainNormal(vec3 p, float t) {
  // Epsilon scaled to the projected pixel footprint. A fixed epsilon aliases
  // badly in the distance and over-smooths up close.
  float e = max(0.0025 * t, 0.02);
  vec2 h = vec2(e, 0.0);
  // Same field the ray marched. Sampling a smoother field here is what put
  // needle-shaped highlights on every fine ridge.
  return normalize(vec3(
    terrainDetail(p.xz - h.xy) - terrainDetail(p.xz + h.xy),
    2.0 * e,
    terrainDetail(p.xz - h.yx) - terrainDetail(p.xz + h.yx)
  ));
}

// Soft shadow by penumbra estimation — track the closest approach of the
// shadow ray to the terrain and use it as an occlusion width. Cheaper than
// any kind of area sampling and the falloff reads correctly at this scale.
float terrainShadow(vec3 ro, vec3 rd, int steps) {
  float res = 1.0;
  float t = 0.35;
  for (int i = 0; i < 24; i++) {
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    float h = p.y - terrainCoarse(p.xz);
    res = min(res, 12.0 * h / t);
    if (res < 0.01) break;
    t += clamp(h * 0.7, 0.6, 9.0);
    if (t > 90.0) break;
  }
  return saturate(res);
}

// ------------------------------------------------------------------- sky ---

// Dusk stars: one jittered point per cell of a grid projected onto the dome.
// Only a few percent of cells hold one, so it reads as a sky, not a texture.
float stars(vec3 rd) {
  if (rd.y < 0.06) return 0.0;
  vec2 g = rd.xz / (rd.y + 0.6) * 70.0;
  vec2 id = floor(g);
  float h = hash21(id);
  if (h < 0.965) return 0.0;
  vec2 c = hash22(id) * 0.7 + 0.15;
  float d = length(fract(g) - c);
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.3 + h * 2.7) + h * 40.0);
  return smoothstep(0.13, 0.0, d) * twinkle * smoothstep(0.06, 0.45, rd.y)
       * (h - 0.965) / 0.035;
}

vec3 skyColor(vec3 rd, vec3 sunDir, float quality, float night) {
  float h = rd.y;
  float sd = saturate(dot(rd, sunDir));

  // Base dome: violet haze at the horizon to indigo overhead. 0.55 keeps the
  // haze low; closer to 1 it climbed halfway up the frame.
  vec3 col = mix(uHorizon, uZenith, pow(saturate(h * 1.05 + 0.02), 0.55));

  // The glow is its own term, confined to the sun's corner of the sky. Blended
  // into the horizon colour instead, it covered the whole view — the camera
  // faces the sun — and the frame went one magenta. Fading it with altitude
  // keeps it a band, not a spotlight.
  float near = pow(sd, 10.0) * (1.0 - smoothstep(-0.05, 0.4, h));
  col = mix(col, uGlow, saturate(near * mix(0.7, 0.95, night)));

  // The horizon line itself warms toward the sun's azimuth — the last light.
  vec2 dirH = rd.xz / max(length(rd.xz), 1e-4);
  vec2 sunH = sunDir.xz / max(length(sunDir.xz), 1e-4);
  float toward = pow(dot(dirH, sunH) * 0.5 + 0.5, 12.0);
  col += uGlow * exp(-abs(h) * 24.0) * toward * mix(0.10, 0.30, night);
  vec3 horizon = mix(uHorizon, uGlow, toward * 0.35);

  // Fog and reflections look up the sky at quality 0 and never show stars;
  // skipping them there skips the hashing too.
  if (quality > 0.0 && night > 0.0) col += vec3(0.95, 0.92, 1.0) * stars(rd) * night;

  col += uSun * pow(sd, 1400.0) * mix(5.0, 12.0, night);                  // disk
  col += mix(uSun, uGlow, 0.45) * pow(sd, 64.0) * mix(0.25, 0.45, night); // inner bloom
  col += uGlow * pow(sd, 6.0) * mix(0.04, 0.08, night);                   // wide scatter

  // Cloud deck, projected onto a plane rather than marched. Only worth the
  // taps when the ray is actually heading upward.
  if (h > 0.0 && quality > 0.35) {
    vec2 cp = rd.xz / max(h + 0.08, 0.02) * 0.55;
    cp += uTime * 0.012;
    float d = fbm(cp, 5);
    float cover = smoothstep(0.44, 0.78, d) * smoothstep(0.0, 0.22, h);
    // Lit edges take the glow and the sun, shaded bellies the zenith: rose
    // rims on indigo cloud at dusk, blush on periwinkle at dawn.
    float lit = saturate(sd * 0.75 + 0.12 + (d - 0.6) * 0.9);
    vec3 shade = mix(uZenith, uHorizon, 0.35) * mix(0.95, 1.5, night);
    vec3 rim   = mix(uGlow, uSun, 0.35) * mix(1.0, 1.15, night);
    col = mix(col, mix(shade, rim, lit), cover * mix(0.55, 0.45, night));
  }

  // Below the horizon the sky is only ever seen through fog, so flatten it.
  col = mix(col, horizon * 0.72, saturate(-h * 6.0));
  return col;
}

// ------------------------------------------------------------- materials ---

vec3 terrainAlbedo(vec3 p, vec3 n, float alt, float night) {
  float slope = 1.0 - n.y;

  // Cool in the valleys, warm on the ridges — the same split as the lighting,
  // so the material and the light agree about where the colour goes.
  vec3 col = mix(uRockLow, uRockHigh, smoothstep(0.05, 0.9, alt));

  // Sediment strata on the steep faces, warped so the bands meander along the
  // relief instead of slicing it at constant height like the contours do.
  float band = p.y * 0.85 + noise(p.xz * 0.19) * 1.7;
  float strata = smoothstep(0.25, 0.75, abs(fract(band) * 2.0 - 1.0));
  // Half strength at dawn: pastel bands on pale rock read as stripes, not rock.
  col = mix(col, uStrata, strata * smoothstep(0.18, 0.55, slope) * mix(0.3, 0.6, night));

  // Flats collect sediment, paler than the rock around them.
  float settle = smoothstep(0.6, 0.92, n.y) * (1.0 - smoothstep(0.3, 0.8, alt));
  col = mix(col, mix(uRockLow, uRockHigh, 0.6), settle * 0.5);

  // Fine grain so the flats are not a flat fill under a moving camera.
  col *= 0.85 + 0.3 * noise(p.xz * 2.3);
  return col;
}

// Elevation contours. A direct nod to the source data — and they double as a
// free readability cue for the terrain's shape where the lighting is flat.
float contourLines(vec3 p, vec3 n, float t) {
  const float spacing = 1.35;
  float e = p.y / spacing;

  // The threshold has to be scaled by the surface gradient. A contour is a
  // level set of height, so on a shallow slope consecutive contours sit far
  // apart *along the surface* and a fixed height-space width paints a band
  // metres wide; on a cliff the same width is invisible. length(n.xz) is
  // sin(slope), which converts a width measured along the surface into the
  // height-space threshold that produces it.
  float grad = max(length(n.xz), 0.02);

  // Width from the projected footprint rather than fwidth(): this runs inside
  // the surface-hit branch, and a derivative taken in non-uniform control flow
  // is undefined — quad neighbours that took the sky path poison it.
  // rd = normalize(cam * vec3(uv, 1.5)) with uv spanning +/-0.5 vertically, so
  // a world length L at distance t covers L * 1.5 * H / t pixels; ~1.6px on a
  // 1080-tall buffer is L = 0.001t, halved again because min(fract, 1 - fract)
  // makes the threshold a half-width.
  float surfaceWidth = clamp(0.0011 * t, 0.010, 0.16);
  float w = surfaceWidth * grad / spacing;

  float dist = min(fract(e), 1.0 - fract(e));
  float line = 1.0 - smoothstep(0.0, w, dist);
  // Fade out before the spacing drops below a pixel and the lines turn to moire.
  return line * (1.0 - smoothstep(26.0, 62.0, t));
}

// Height fog with in-scattering toward the sun. exp2 in the height term so
// valleys fill and ridges stay clear. The haze is the cool half of the palette
// and the glow only scatters into it along the sun's line: cool distance, warm
// sun, which is what gives the frame depth in colour as well as in value.
vec3 applyFog(vec3 col, vec3 rd, vec3 sunDir, float t, float y, float night) {
  float density = mix(0.010, 0.011, night);
  float amount = 1.0 - exp(-t * density * exp2(-(y + 2.0) * 0.16));
  vec3 haze = mix(uHorizon, uZenith, 0.3) * mix(0.95, 1.3, night);
  vec3 fogCol = haze + uGlow * pow(saturate(dot(rd, sunDir)), 10.0) * mix(0.3, 0.6, night);
  return mix(col, fogCol, saturate(amount));
}

// ------------------------------------------------------------------ main ---

void main() {
  vec2 frag = vUv * uResolution;
  vec2 uv = (frag - 0.5 * uResolution) / uResolution.y;

  float night = uTheme;

  int  marchSteps  = int(mix(56.0, 150.0, uQuality));
  int  shadowSteps = int(mix(6.0, 20.0, uQuality));
  bool doShadows   = uQuality > 0.3;

  // -- camera -------------------------------------------------------------
  float travel = uTime * 1.15;
  float rise   = uScroll * 9.0;

  vec3 ro = vec3(uMouse.x * 2.6, 0.0, travel);
  // max() against a floor keeps the eye above the valley floors as well as the
  // ridges; without it the camera dives every time the field dips. The medium
  // field, not the coarse one — coarse undershoots by several units and put
  // the eye inside the hillside.
  ro.y = max(terrainMedium(ro.xz) + 7.5, 11.0) + rise;

  vec3 target = ro + vec3(uMouse.x * 4.0, -2.6 + uMouse.y * 1.6 - uScroll * 1.2, 16.0);
  mat3 cam = lookAt(ro, target, uMouse.x * 0.035);

  // 1.5 focal length ~ 37 degrees vertical. Wider reads as a game camera and
  // stretches the corners; tighter loses the ridges at the edges of frame.
  vec3 rd = normalize(cam * vec3(uv, 1.5));

  vec3 sunDir = normalize(vec3(-0.42, 0.085 + uScroll * 0.05, 0.9));

  // Key light: the warm note in a cool palette. At dusk it is strong and low;
  // at dawn it is softer and the sky does more of the work.
  // Dawn stays well under the tonemapper's shoulder: brighter, and ACES bleaches
  // the pastels to white.
  vec3 sunCol = uSun * mix(1.35, 3.2, night);

  float tmax = 165.0;

  // The water plane wins wherever the ray reaches it before the rock, so the
  // march stops at the surface: marching on under the lake to the far shore
  // made every water pixel pay for terrain it would never show, and cost the
  // open vistas a fifth of their frame.
  float tw = rd.y < -1e-4 ? (WATER_LEVEL - ro.y) / rd.y : -1.0;
  float t = marchTerrain(ro, rd, tw > 0.0 ? min(tmax, tw) : tmax, marchSteps);
  bool water = t < 0.0 && tw > 0.0 && tw < tmax;

  vec3 col;
  if (water) {
    vec3 wp = ro + rd * tw;
    // Ripples from the derivative of one noise tap: a normal for free.
    vec3 rn = noised(wp.xz * 1.3 + vec2(uTime * 0.21, uTime * 0.13));
    vec3 wn = normalize(vec3(-rn.y * 0.035, 1.0, -rn.z * 0.035));
    vec3 refl = reflect(rd, wn);
    refl.y = abs(refl.y);

    // It mirrors the sky, glow and all, which puts the palette into the lower
    // half of the frame where the rock is darkest.
    float fr = fresnel(saturate(dot(wn, -rd)), 0.02);
    vec3 mirrored = skyColor(refl, sunDir, 0.0, night);
    float depth = saturate((WATER_LEVEL - terrainCoarse(wp.xz)) * 0.6);
    vec3 body = mix(mix(uRockLow, uMist, 0.25), uRockLow * 0.3, depth);
    col = mix(body, mirrored, fr * 0.85 + 0.15);
    col += uSun * pow(saturate(dot(refl, sunDir)), 220.0) * mix(1.5, 5.0, night);

    // A pale shoreline where the bed comes up to meet the surface.
    float shore = 1.0 - smoothstep(0.0, 0.1, depth);
    col = mix(col, mix(uRockHigh, uGlow, 0.35) * mix(0.9, 0.6, night), shore * 0.4);

    col = applyFog(col, rd, sunDir, tw, WATER_LEVEL, night);
  } else if (t < 0.0) {
    col = skyColor(rd, sunDir, uQuality, night);
  } else {
    vec3 p = ro + rd * t;
    vec3 n = terrainNormal(p, t);
    float alt = saturate((p.y - WATER_LEVEL) / (TERRAIN_HEIGHT * 0.75));
    vec3 albedo = terrainAlbedo(p, n, alt, night);

    float shadow = doShadows ? terrainShadow(p + n * 0.06, sunDir, shadowSteps) : 1.0;
    // Dawn means diffuse: low cloud, so shadows are present but shallow
    // rather than absent.
    shadow = mix(mix(shadow, 1.0, 0.55), shadow, night);

    // Key, wrapped a little (the +0.12 / 1.12) so the terminator is not a hard
    // line on a surface this rough. Dawn wraps much further.
    float wrap = mix(0.55, 0.12, night);
    float ndl = saturate((dot(n, sunDir) + wrap) / (1.0 + wrap));
    vec3 diffuse = sunCol * ndl * shadow;

    // Sky fill: the dome's own colours, cool from overhead and from the haze
    // side. Scaled well up at dusk, where the palette is near black in linear
    // and would otherwise leave the shadow side with nothing.
    vec3 skyFill = mix(uHorizon * 1.3, mix(uZenith, uHorizon, 0.5),
                       saturate(n.y * 0.5 + 0.5));
    vec3 ambient = skyFill * mix(0.42, 2.6, night) + vec3(0.004);

    // Single bounce off the glowing ground, backfilling the shadow side.
    float bounceTerm = saturate(-dot(n, sunDir) * 0.5 + 0.5) * saturate(1.0 - n.y);
    vec3 bounce = uGlow * mix(0.02, 0.07, night) * bounceTerm;

    col = albedo * (diffuse + ambient + bounce);

    // Grazing-angle sheen in the glow colour. It is what separates one ridge
    // from the next where they overlap, and a rose rim on violet rock is the
    // scene's signature.
    float rim = fresnel(saturate(dot(n, -rd)), 0.035);
    col += mix(uGlow, uSun, 0.3) * rim * shadow * mix(0.04, 0.22, night)
         * saturate(dot(n, sunDir) * 0.5 + 0.5);

    // Contour ink shifts with elevation, the way a relief map tints by height.
    // Additive at dusk (bright ink on dark rock), subtractive at dawn (dark ink
    // on pale rock) — adding in both directions makes them vanish in daylight.
    float c = contourLines(p, n, t);
    vec3 ink = mix(uInk, uInkAlt, smoothstep(0.35, 0.85, alt));
    vec3 lineAdditive    = col + ink * c * 0.25;
    vec3 lineSubtractive = mix(col, ink * 0.9, c * 0.4);
    col = mix(lineSubtractive, lineAdditive, night);

    col = applyFog(col, rd, sunDir, t, p.y, night);
  }

  // Ground mist: a thin band riding just above the valley floors, sampled
  // along the ray rather than at the hit point so it reads as volume.
  if (uQuality > 0.25) {
    float hitT = water ? tw : t;
    float mistT = min(hitT < 0.0 ? 110.0 : hitT, 110.0);
    vec3 mp = ro + rd * mistT * 0.55;
    float band = exp(-abs(mp.y - max(terrainCoarse(mp.xz), WATER_LEVEL) - 1.1) * 0.75);
    float turb = fbm(mp.xz * 0.09 + vec2(uTime * 0.05, 0.0), 4);
    float mist = saturate(band * turb * 1.5) * saturate(mistT / 40.0);
    vec3 mistCol = uMist * mix(0.95, 1.4, night);
    col = mix(col, mistCol, mist * mix(0.25, 0.3, night));
  }

  // -- post ---------------------------------------------------------------

  // Exposure, then ACES. The other order crushes the sun disk.
  col *= mix(0.62, 1.0, night);
  col = tonemapACES(col);

  // Vignette. Kept mild — this sits behind live text.
  float vig = 1.0 - 0.34 * pow(length(uv * vec2(0.72, 1.0)), 2.1);
  col *= vig;

  col = linearToSRGB(col);
  col = dither(col, frag);

  fragColor = vec4(col, 1.0);
}
`;
