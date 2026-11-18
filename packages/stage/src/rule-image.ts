import { Container, Filter, GlProgram, RenderTexture, Sprite, Texture, type Application } from 'pixi.js';
import type { CompiledRuleImageTransition } from '@galcraft/contracts';
import { ease } from './animation.js';

const vertex = `precision highp float;
in vec2 aPosition;
out vec2 vInput;
out vec2 vPoint;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 pixel = uOutputFrame.xy + aPosition * uOutputFrame.zw;
  gl_Position = vec4(pixel.x * 2.0 / uOutputTexture.x - 1.0,
    pixel.y * 2.0 * uOutputTexture.z / uOutputTexture.y - uOutputTexture.z, 0.0, 1.0);
  vInput = aPosition * uOutputFrame.zw * uInputSize.zw;
  vPoint = aPosition;
}`;
const fragment = `precision highp float;
in vec2 vInput;
in vec2 vPoint;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uFrom;
uniform sampler2D uRule;
uniform vec3 uReveal;
void main() {
  vec4 rule = texture(uRule, vPoint);
  float gray = dot(rule.rgb / max(rule.a, 0.00001), vec3(.2126, .7152, .0722));
  float level = mix(gray, 1.0 - gray, uReveal.z);
  float halfEdge = uReveal.y * .5;
  float threshold = mix(-halfEdge, 1.0 + halfEdge, uReveal.x);
  float amount = halfEdge > 0.0 ? 1.0 - smoothstep(threshold - halfEdge, threshold + halfEdge, level) : step(level, threshold);
  if (uReveal.x <= 0.0) amount = 0.0;
  if (uReveal.x >= 1.0) amount = 1.0;
  finalColor = mix(texture(uFrom, vPoint), texture(uTexture, vInput), amount);
}`;

/** Composite two premultiplied stage-design surfaces with the same gray threshold. */
export class RuleImageSurface {
  readonly sprite: Sprite;
  readonly from: RenderTexture;
  private readonly to: RenderTexture;
  private readonly filter: Filter;
  private readonly reveal: Float32Array;
  private readonly source = new Container();

  constructor(private readonly renderer: Application['renderer'], design: { width: number; height: number },
    rule: Texture, readonly settings: CompiledRuleImageTransition) {
    this.from = RenderTexture.create(design);
    this.to = RenderTexture.create(design);
    this.sprite = new Sprite(this.to);
    this.reveal = new Float32Array([0, settings.softness, Number(settings.reverse)]);
    this.filter = new Filter({ glProgram: GlProgram.from({ name: 'galcraft-rule-image', vertex, fragment }), clipToViewport: false,
      resources: { uFrom: this.from.source, uRule: rule.source, reveal: { uReveal: { value: this.reveal, type: 'vec3<f32>' } } } });
    this.sprite.filters = [this.filter];
  }

  capture(container: Container, target: 'from' | 'to') {
    this.renderer.render({ container, target: this[target], clear: true });
  }

  captureSprite(sprite: Sprite, target: 'from' | 'to') {
    const parent = sprite.parent;
    this.source.addChild(sprite);
    this.capture(this.source, target);
    parent?.addChild(sprite);
  }

  captureMovieFrame(frame: HTMLCanvasElement, target: 'from' | 'to') {
    const texture = Texture.from(frame), sprite = new Sprite(texture);
    this.source.addChild(sprite);
    try { this.capture(this.source, target); }
    finally { sprite.destroy(); texture.destroy(true); }
  }

  progress(elapsedMs: number) {
    const { durationMs, easing } = this.settings;
    this.reveal[0] = Math.max(0, Math.min(1, ease(Math.min(1, elapsedMs / durationMs), easing.family, easing.direction)));
  }

  dispose() {
    this.sprite.filters = [];
    this.sprite.destroy();
    this.filter.destroy();
    this.from.destroy(true);
    this.to.destroy(true);
    this.source.destroy();
  }
}
