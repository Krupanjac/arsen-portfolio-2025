/**
 * Shared GLSL. Concatenated into fragment shaders after the #version line.
 */
export const GLSL_COMMON = /* glsl */ `
#define PI   3.14159265359
#define TAU  6.28318530718

// ---------------------------------------------------------------- hashing --

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  return fract(p * (p + p));
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// ------------------------------------------------------------------ noise --

// Value noise with analytic derivatives. Returning the gradient alongside the
// value is what makes cheap erosion and normal-free lighting possible: the
// caller gets dh/dx and dh/dz for free instead of paying for extra taps.
vec3 noised(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);

  // Quintic interpolant — C2 continuous, so fBm built on it has no visible
  // grid creases where octaves line up.
  vec2 u  = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = a - b - c + d;

  return vec3(
    k0 + k1 * u.x + k2 * u.y + k3 * u.x * u.y,
    du * vec2(k1 + k3 * u.y, k2 + k3 * u.x)
  );
}

float noise(vec2 x) { return noised(x).x; }

// 3D value noise, for volumetrics where a 2D field would read as a curtain.
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (i.xy + vec2(37.0, 17.0) * i.z) + f.xy;
  float a = hash21(uv);
  float b = hash21(uv + vec2(37.0, 17.0));
  return mix(a, b, f.z);
}

// ------------------------------------------------------------------- fBm ---

const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);

// Eroded fBm. Each octave is attenuated by the accumulated gradient of the
// octaves above it, so slopes that are already steep stop gaining detail —
// the cheap trick that turns generic lumpy noise into something with ridges
// and valleys instead of an even blanket of bumps.
float fbmEroded(vec2 p, int octaves) {
  float a = 0.5;
  float sum = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    vec3 n = noised(p);
    // The gradient accumulates in the *warped* space, so noised() is sampled
    // at the transformed point and its derivative is taken as-is. Scaling the
    // derivative by the octave frequency instead makes dot(grad, grad) grow
    // like f^2 — past four octaves the divisor is in the hundreds and every
    // remaining octave is silently divided out of existence, which is exactly
    // the bug that made this field indistinguishable at 4 octaves and at 9.
    grad += n.yz;
    sum += a * n.x / (1.0 + dot(grad, grad));
    a *= 0.5;
    p = ROT * p * 2.02;
  }
  return sum;
}

float fbm(vec2 p, int octaves) {
  float a = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    sum += a * noise(p);
    p = ROT * p * 2.02;
    a *= 0.5;
  }
  return sum;
}

// Ridged variant — the sharp crest term. Used for the far silhouette only.
float ridged(vec2 p, int octaves) {
  float a = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
    sum += a * n * n;
    p = ROT * p * 2.02;
    a *= 0.5;
  }
  return sum;
}

// ------------------------------------------------------------- tone / eotf --

// ACES filmic, Narkowicz's fit. Cheap, and it rolls highlights off instead of
// clipping them to white the way a Reinhard curve does on a bright sun disk.
vec3 tonemapACES(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// Interleaved gradient noise (Jimenez). One MAD and a fract, and it breaks up
// 8-bit banding in the sky gradient far better than a white-noise dither of
// the same amplitude because the error is spatially decorrelated.
float interleavedGradientNoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec3 dither(vec3 color, vec2 fragCoord) {
  float n = interleavedGradientNoise(fragCoord);
  return color + (n - 0.5) / 255.0;
}

// ------------------------------------------------------------------ utils --

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3  saturate(vec3 x)  { return clamp(x, 0.0, 1.0); }

mat3 lookAt(vec3 eye, vec3 target, float roll) {
  vec3 f = normalize(target - eye);
  vec3 up = vec3(sin(roll), cos(roll), 0.0);
  vec3 r = normalize(cross(f, up));
  vec3 u = cross(r, f);
  return mat3(r, u, f);
}

// Schlick. Used for the wet-slate rim on the terrain and the water plane.
float fresnel(float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}
`;
