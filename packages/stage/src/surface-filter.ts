import { Filter, GlProgram, Texture, TexturePool, type FilterSystem, type RenderSurface } from 'pixi.js';
import type { EffectValues } from '@galcraft/contracts';
import { ShockwaveFilter } from 'pixi-filters';

const vertex = `precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 pixel = uOutputFrame.xy + aPosition * uOutputFrame.zw;
  gl_Position = vec4(pixel.x * 2.0 / uOutputTexture.x - 1.0,
    pixel.y * 2.0 * uOutputTexture.z / uOutputTexture.y - uOutputTexture.z, 0.0, 1.0);
  vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
}`;
const fragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uBevel;
uniform vec3 uLight;
uniform vec4 uCircle;
uniform float uInvert;
uniform float uCircleEnabled;
float softAlpha(vec2 point) {
  vec2 spread = uInputSize.zw * uBevel.x * uBevel.z;
  return (texture(uTexture, point).a * 4.0 + texture(uTexture, point + vec2(spread.x, 0.0)).a
    + texture(uTexture, point - vec2(spread.x, 0.0)).a + texture(uTexture, point + vec2(0.0, spread.y)).a
    + texture(uTexture, point - vec2(0.0, spread.y)).a) / 8.0;
}
void main() {
  vec4 color = texture(uTexture, vTextureCoord);
  vec2 offset = vec2(cos(uBevel.y), sin(uBevel.y)) * uBevel.x * uInputSize.zw;
  float edge = softAlpha(vTextureCoord + offset) - softAlpha(vTextureCoord - offset);
  color.rgb = mix(color.rgb, uLight * color.a, max(edge, 0.0) * uBevel.w);
  color.rgb *= 1.0 - max(-edge, 0.0) * uBevel.w;
  vec2 point = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
  vec2 aspect = uOutputFrame.zw / min(uOutputFrame.z, uOutputFrame.w);
  float distance = length((point - uCircle.xy) * aspect);
  float feather = max(uCircle.w, 0.00001);
  float amount = 1.0 - smoothstep(uCircle.z - feather, uCircle.z + feather, distance);
  if (uInvert > 0.5) amount = 1.0 - amount;
  finalColor = color * mix(1.0, amount, uCircleEnabled);
}`;

/** Alpha-edge bevel softness and circular reveal use normalized local surface coordinates. */
export function surfaceFilter(values: EffectValues): Filter {
  const bevel = values.bevel, circle = values.circle;
  return new Filter({ glProgram: GlProgram.from({ name: 'galcraft-surface', vertex, fragment }), padding: Math.ceil(bevel.thickness + 1),
    resources: { surfaceUniforms: {
      uBevel: { value: new Float32Array([bevel.thickness, bevel.rotationDeg * Math.PI / 180, bevel.softness, bevel.opacity]), type: 'vec4<f32>' },
      uLight: { value: new Float32Array(bevel.rgb.map(value => value / 255)), type: 'vec3<f32>' },
      uCircle: { value: new Float32Array([circle?.centerX ?? .5, circle?.centerY ?? .5, circle?.radius ?? 2, circle?.softness ?? 0]), type: 'vec4<f32>' },
      uInvert: { value: circle?.invert ? 1 : 0, type: 'f32' }, uCircleEnabled: { value: circle ? 1 : 0, type: 'f32' },
    } } });
}

/** Pixi receives pixel centers; authored centers use the current local filter surface. */
export class SurfaceShockwaveFilter extends ShockwaveFilter {
  constructor(private readonly authored: NonNullable<EffectValues['shockwave']>) {
    super(authored);
  }
  override apply(manager: FilterSystem, input: Texture, output: RenderSurface, clear: boolean) {
    this.center = { x: this.authored.centerX * input.frame.width, y: this.authored.centerY * input.frame.height };
    super.apply(manager, input, output, clear);
  }
}

export class FadedFilter extends Filter {
  constructor(readonly inner: Filter, amount: number) {
    super({ glProgram: GlProgram.from({ name: 'galcraft-effect-fade', vertex, fragment: `precision highp float; in vec2 vTextureCoord;
      out vec4 finalColor; uniform sampler2D uTexture; uniform sampler2D uOriginal; uniform float uAmount;
      void main() { finalColor = mix(texture(uOriginal, vTextureCoord), texture(uTexture, vTextureCoord), uAmount); }` }),
      resources: { uOriginal: Texture.EMPTY.source, fadeUniforms: { uAmount: { value: amount, type: 'f32' } } }, padding: inner.padding });
  }
  override apply(manager: FilterSystem, input: Texture, output: RenderSurface, clear: boolean) {
    const processed = TexturePool.getSameSizeTexture(input);
    try { this.inner.apply(manager, input, processed, true); this.resources.uOriginal = input.source;
      manager.applyFilter(this, processed, output, clear); }
    finally { TexturePool.returnTexture(processed); }
  }
  override destroy() { this.inner.destroy(); super.destroy(); }
}
