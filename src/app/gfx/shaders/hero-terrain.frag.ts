/**
 * Hero scene: a raymarched, eroded heightfield.
 *
 * Chosen because it is the honest version of the day job — an OSM-derived
 * terrain pipeline rendered the way the real one is, with the same problems
 * (LOD, silhouette cost, fog as a horizon budget) rather than an abstract
 * gradient that happens to run on the GPU.
 *
 * Two lighting conditions, selected by uTheme and blended with mix() rather
 * than branched: dusk for the dark theme, overcast noon for the light one.
 * They are separate scenes, not one scene with a filter over it — the first
 * attempt post-processed the dusk render toward white for light mode and the
 * result was a flat grey field with no terrain left in it.
 *
 * Cost control, in order of how much it matters:
 *   - Step count and octave count both scale off uQuality, which the dynamic
 *     resolution scaler drives.
 *   - The height function used by the shadow and fog marches is a 3-octave
 *     stand-in, not the full field. Shadows do not need the detail and the
 *     silhouette they cast is identical at this scale.
 *   - Sky is evaluated analytically, never marched.
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
uniform vec3  uAccent;     // brand accent, linear space
uniform vec3  uSky;        // zenith base, linear space
uniform float uQuality;    // 0..1
uniform float uTheme;      // 0 = light/overcast, 1 = dark/dusk

// ------------------------------------------------------------- the field ---

const float TERRAIN_SCALE  = 0.055;
const float TERRAIN_HEIGHT = 13.0;

float terrainDetail(vec2 p) {
  return fbmEroded(p * TERRAIN_SCALE, 8) * TERRAIN_HEIGHT;
}

// Used for camera placement only, where the extra octaves buy nothing.
float terrainMedium(vec2 p) {
  return fbmEroded(p * TERRAIN_SCALE, 6) * TERRAIN_HEIGHT;
}

// Coarse stand-in for shadow and fog marches — same silhouette, a third of
// the taps. Anything finer is invisible once it is a shadow.
float terrainCoarse(vec2 p) {
  return fbmEroded(p * TERRAIN_SCALE, 3) * TERRAIN_HEIGHT;
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

vec3 skyColor(vec3 rd, vec3 sunDir, float quality, float night) {
  float h = rd.y;

  vec3 zenith = uSky + mix(vec3(0.020, 0.030, 0.052), vec3(0.010, 0.017, 0.040), night);

  // The horizon band is where the accent belongs — it is the one place a
  // saturated colour is doing a job (scattering near the sun) rather than
  // tinting the whole dome.
  vec3 horizonDusk     = mix(vec3(0.042, 0.050, 0.078), uAccent * 0.62, 0.30);
  vec3 horizonOvercast = mix(vec3(0.72, 0.745, 0.80), uAccent * 3.2, 0.20);
  vec3 horizon = mix(horizonOvercast, horizonDusk, night);

  // 0.85 keeps the band low. At 0.42 the accent reached halfway up the frame
  // and stopped reading as atmosphere.
  vec3 col = mix(horizon, zenith, pow(saturate(h * 1.05 + 0.02), 0.85));

  // Dusk gets a hard accent-coloured sun; overcast gets a soft warm one behind
  // cloud, which is why its disk term is a third of the intensity.
  vec3 sunTint = mix(vec3(1.0, 0.965, 0.90), uAccent, night);
  float sd = saturate(dot(rd, sunDir));
  col += sunTint * pow(sd, 1400.0) * mix(8.0, 26.0, night);   // disk
  col += sunTint * pow(sd, 48.0)   * mix(0.30, 0.55, night);  // inner bloom
  col += sunTint * pow(sd, 6.0)    * mix(0.030, 0.040, night); // wide scatter

  // Cloud deck, projected onto a plane rather than marched. Only worth the
  // taps when the ray is actually heading upward.
  if (h > 0.0 && quality > 0.35) {
    vec2 cp = rd.xz / max(h + 0.08, 0.02) * 0.55;
    cp += uTime * 0.012;
    float d = fbm(cp, 5);
    float cover = smoothstep(0.44, 0.78, d) * smoothstep(0.0, 0.22, h);
    vec3 litDusk     = mix(vec3(0.05, 0.062, 0.092), uAccent * 1.05, saturate(sd * 0.7 + 0.1));
    vec3 litOvercast = mix(vec3(0.66, 0.68, 0.73), vec3(0.95, 0.94, 0.92), saturate(sd * 0.7 + 0.1));
    col = mix(col, mix(litOvercast, litDusk, night), cover * mix(0.5, 0.34, night));
  }

  // Below the horizon the sky is only ever seen through fog, so flatten it.
  col = mix(col, horizon * 0.72, saturate(-h * 6.0));
  return col;
}

// ------------------------------------------------------------- materials ---

vec3 terrainAlbedo(vec3 p, vec3 n, float night) {
  float slope = 1.0 - n.y;
  float alt = saturate((p.y + 1.0) / TERRAIN_HEIGHT);

  // Wet slate at dusk; dry chalk and limestone under overcast. The light
  // scene needs genuinely high-albedo rock — dark rock under a bright sky
  // reads as a silhouette and swallows any text placed over it.
  vec3 slate = mix(vec3(0.600, 0.600, 0.585), vec3(0.074, 0.081, 0.098), night);
  vec3 scree = mix(vec3(0.700, 0.685, 0.660), vec3(0.115, 0.110, 0.106), night);
  vec3 dust  = mix(vec3(0.800, 0.785, 0.755), vec3(0.185, 0.174, 0.163), night);

  // Rock where it is steep, sediment where it is flat.
  vec3 col = mix(slate, scree, smoothstep(0.15, 0.55, slope));

  // Sediment settles on shallow slopes at low altitude — inverted from a snow
  // line, because the interesting silhouettes here are the ridges, not the caps.
  float settle = smoothstep(0.55, 0.9, n.y) * (1.0 - smoothstep(0.25, 0.7, alt));
  col = mix(col, dust, settle * 0.65);

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

  // Key light. At dusk it is warm and near-white with the accent as a tint —
  // an accent-coloured key made every lit surface the same hue as the sky and
  // erased the material. Under overcast it is neutral and much softer.
  vec3 sunColDusk     = mix(vec3(1.0, 0.74, 0.52), uAccent, 0.42) * 3.1;
  vec3 sunColOvercast = vec3(1.0, 0.975, 0.935) * 1.9;
  vec3 sunCol = mix(sunColOvercast, sunColDusk, night);

  float tmax = 165.0;
  float t = marchTerrain(ro, rd, tmax, marchSteps);

  vec3 col;
  if (t < 0.0) {
    col = skyColor(rd, sunDir, uQuality, night);
  } else {
    vec3 p = ro + rd * t;
    vec3 n = terrainNormal(p, t);
    vec3 albedo = terrainAlbedo(p, n, night);

    float shadow = doShadows ? terrainShadow(p + n * 0.06, sunDir, shadowSteps) : 1.0;
    // Overcast means diffuse: the sun is behind cloud, so shadows are present
    // but shallow rather than absent.
    shadow = mix(mix(shadow, 1.0, 0.55), shadow, night);

    // Key, wrapped a little (the +0.12 / 1.12) so the terminator is not a hard
    // line on a surface this rough. Overcast wraps much further.
    float wrap = mix(0.55, 0.12, night);
    float ndl = saturate((dot(n, sunDir) + wrap) / (1.0 + wrap));
    vec3 diffuse = sunCol * ndl * shadow;

    // Hemispheric fill. Scaled off constants rather than uSky, which is close
    // to black in linear at dusk and would leave the shadow side with nothing.
    vec3 fillDusk = mix(uAccent * 0.10 + vec3(0.012), vec3(0.055, 0.068, 0.095),
                        saturate(n.y * 0.5 + 0.5)) * 2.6;
    vec3 fillOvercast = mix(vec3(0.150, 0.158, 0.175), vec3(0.400, 0.445, 0.545),
                            saturate(n.y * 0.5 + 0.5));
    vec3 ambient = mix(fillOvercast, fillDusk, night);

    // Single bounce off the ground plane, backfilling the shadow side.
    float bounceTerm = saturate(-dot(n, sunDir) * 0.5 + 0.5) * saturate(1.0 - n.y);
    vec3 bounce = uAccent * mix(0.02, 0.06, night) * bounceTerm;

    col = albedo * (diffuse + ambient + bounce);

    // Grazing-angle sheen. Damp slate is never fully matte and the rim is what
    // separates one ridge from the next when they overlap. Dry chalk is, so
    // the light scene gets almost none.
    float rim = fresnel(saturate(dot(n, -rd)), 0.035);
    col += sunCol * rim * shadow * mix(0.03, 0.13, night)
         * saturate(dot(n, sunDir) * 0.5 + 0.5);

    // Contours are additive at dusk (the accent is bright against dark rock)
    // and subtractive under overcast (the accent is dark against pale rock).
    // Adding in both directions would make them invisible in the light theme.
    float c = contourLines(p, n, t);
    vec3 lineAdditive   = col + uAccent * c * 0.85;
    vec3 lineSubtactive = mix(col, uAccent * 2.4, c * 0.55);
    col = mix(lineSubtactive, lineAdditive, night);

    // Height fog with in-scattering toward the sun. exp2 in the height term so
    // valleys fill and ridges stay clear. Overcast is much hazier.
    float fogDensity = mix(0.021, 0.011, night);
    float fogAmount = 1.0 - exp(-t * fogDensity * exp2(-(p.y + 2.0) * 0.16));
    vec3 fogCol = skyColor(rd, sunDir, 0.0, night);
    fogCol += uAccent * pow(saturate(dot(rd, sunDir)), 6.0) * mix(0.2, 0.5, night);
    col = mix(col, fogCol, saturate(fogAmount));
  }

  // Ground mist: a thin band riding just above the valley floors, sampled
  // along the ray rather than at the hit point so it reads as volume.
  if (uQuality > 0.25) {
    float mistT = min(t < 0.0 ? 110.0 : t, 110.0);
    vec3 mp = ro + rd * mistT * 0.55;
    float band = exp(-abs(mp.y - terrainCoarse(mp.xz) - 1.1) * 0.75);
    float turb = fbm(mp.xz * 0.09 + vec2(uTime * 0.05, 0.0), 4);
    float mist = saturate(band * turb * 1.5) * saturate(mistT / 40.0);
    vec3 mistDusk     = mix(uSky * 5.0, uAccent * 1.2, 0.35);
    vec3 mistOvercast = vec3(0.78, 0.80, 0.85);
    col = mix(col, mix(mistOvercast, mistDusk, night), mist * mix(0.5, 0.35, night));
  }

  // -- post ---------------------------------------------------------------

  // Exposure, then ACES. The other order crushes the sun disk.
  col *= mix(0.72, 0.82, night);
  col = tonemapACES(col);

  // Vignette. Kept mild — this sits behind live text.
  float vig = 1.0 - 0.34 * pow(length(uv * vec2(0.72, 1.0)), 2.1);
  col *= vig;

  col = linearToSRGB(col);
  col = dither(col, frag);

  fragColor = vec4(col, 1.0);
}
`;
