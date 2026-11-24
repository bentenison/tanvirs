/**
 * Implicit-surface organism shader.
 *
 * A single full-screen triangle evaluates a compact (Wyvill) metaball
 * field over ≤ MAX_BLOBS anisotropic blobs, with the analytic gradient
 * accumulated in the same loop, one pass, no textures, no post-processing.
 * Shading: dome lighting from the gradient, a thin rim, coral tint where
 * the membrane is under tension, a breathing chlorophyll nucleus, and a
 * procedural dot grid that refracts through the body.
 */
export const MAX_BLOBS = 48
export const MAX_ORGANELLES = 8

export const vertexSource = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

export const fragmentSource = /* glsl */ `#version 300 es
precision highp float;

#define MAX_BLOBS ${MAX_BLOBS}
#define MAX_ORG ${MAX_ORGANELLES}

uniform vec2 uRes;          // drawing buffer px
uniform float uScale;       // buffer px per CSS px
uniform int uCount;
uniform vec4 uA[MAX_BLOBS]; // x, y, r, presence (CSS px)
uniform vec4 uB[MAX_BLOBS]; // dirX, dirY, stretch, tension
uniform int uOrgCount;
uniform vec3 uOrg[MAX_ORG]; // x, y, r
uniform vec3 uCore;         // x, y, r
uniform float uTime;
uniform float uPulse;       // 0..1 heartbeat phase intensity
uniform float uRefract;     // 0 or 1
uniform float uUnit;

uniform vec3 cBody;
uniform vec3 cRim;
uniform vec3 cLight;
uniform vec3 cDot;
uniform vec3 cAccent;
uniform vec3 cTension;
uniform vec3 cBg;

out vec4 outColor;

const float T = 0.3;
const float REACH = 2.0;

float dotGrid(vec2 p, float spacing, float radius) {
  vec2 g = mod(p, spacing) - spacing * 0.5;
  float d = length(g);
  return 1.0 - smoothstep(radius - 0.7, radius + 0.7, d);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;

  float f = 0.0;
  vec2 grad = vec2(0.0);
  float tens = 0.0;
  float pres = 0.0;

  for (int i = 0; i < MAX_BLOBS; i++) {
    if (i >= uCount) break;
    vec4 a = uA[i];
    vec4 b = uB[i];
    float R = a.z * REACH;
    if (R <= 0.0) continue;
    vec2 d = frag - a.xy;
    // Anisotropic distance: stretch along dir, compress across (area-preserving).
    float s = b.z;
    float along = dot(d, b.xy);
    vec2 across = d - along * b.xy;
    vec2 q = b.xy * (along / s) + across * sqrt(s);
    float d2 = dot(q, q);
    float R2 = R * R;
    if (d2 >= R2) continue;
    float x = 1.0 - d2 / R2;
    float w = x * x * x;
    f += w;
    // dw/dp ≈ -6 x² q / R² (ignoring anisotropy in the Jacobian, visually equivalent)
    grad += -6.0 * x * x * q / R2;
    tens += w * b.w;
    pres += w * a.w;
  }

  // Background: a faint computational dot grid that fades with distance from the core.
  float coreDist = length(frag - uCore.xy);
  float vignette = 1.0 - smoothstep(uUnit * 0.25, uUnit * 0.62, coreDist);
  float bgDots = dotGrid(frag, 22.0, 1.05) * vignette * 0.55;

  float aa = max(fwidth(f), 1e-4) * 1.2;
  float inside = smoothstep(T - aa, T + aa, f);

  if (inside <= 0.001) {
    outColor = vec4(cDot * bgDots, bgDots);
    return;
  }

  float tw = f > 0.0 ? tens / f : 0.0;
  float pw = f > 0.0 ? pres / f : 1.0;

  // Dome normal from the field gradient.
  float height = smoothstep(T, T + 0.9, f);
  vec3 n = normalize(vec3(grad * 0.55 * uUnit / 40.0, 1.0 + height * 1.6));
  vec3 L = normalize(vec3(-0.55, -0.7, 0.9));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 28.0);

  vec3 col = cBody;
  col = mix(col, cRim, (1.0 - height) * 0.22);
  col += (cLight - cBody) * diff * 0.16;
  col += cLight * spec * 0.22;

  // Refracted dot grid inside the membrane.
  if (uRefract > 0.5) {
    vec2 offset = -n.xy * 14.0 * (0.4 + height);
    float inner = dotGrid(frag + offset, 22.0, 1.15 + height * 0.5);
    col = mix(col, cLight, inner * 0.13 * (0.4 + height));
  }

  // Chlorophyll nucleus, breathing.
  float nucleus = 1.0 - smoothstep(uCore.z * 0.05, uCore.z * (0.55 + 0.06 * uPulse), coreDist);
  col = mix(col, cAccent, nucleus * 0.92);
  float halo = 1.0 - smoothstep(uCore.z * 0.5, uCore.z * 1.05, coreDist);
  col = mix(col, cAccent, halo * 0.08);

  // Organelles: technologies emerging inside the focused lobe.
  for (int k = 0; k < MAX_ORG; k++) {
    if (k >= uOrgCount) break;
    vec3 o = uOrg[k];
    float od = length(frag - o.xy);
    float disc = 1.0 - smoothstep(o.z - 0.9, o.z + 0.9, od);
    float ring = (1.0 - smoothstep(o.z * 1.5 - 0.8, o.z * 1.5 + 0.8, od)) - disc;
    col = mix(col, cAccent, disc);
    col = mix(col, cLight, clamp(ring, 0.0, 1.0) * 0.25);
  }

  // Edge rim and tension tint (coral appears only under strain).
  float edge = 1.0 - smoothstep(T, T + 0.12, f);
  col = mix(col, cTension, clamp(tw * 1.25, 0.0, 1.0) * (0.35 + edge * 0.65));
  col = mix(col, cRim, edge * 0.35);

  // Receding lobes fade toward the background.
  col = mix(cBg, col, 0.25 + 0.75 * pw);

  // Premultiplied "over" composite of the body on the dot grid.
  vec3 bgPremul = cDot * bgDots;
  outColor = vec4(col * inside + bgPremul * (1.0 - inside), inside + bgDots * (1.0 - inside));
}
`
