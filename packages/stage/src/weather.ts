import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { EffectInstance, Id } from '@galcraft/contracts';

type Particle = { sprite: Sprite | Graphics; x: number; y: number; phase: number; speed: number; size: number; spin: number };
type Weather = { effect: EffectInstance; container: Container; particles: Particle[]; random: () => number; texture: Texture | null; frames: Texture[]; mask: Graphics | null };
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
function random(seed: number) { let value = seed >>> 0; return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 0x100000000); }
const wrap = (value: number, span: number) => ((value % span) + span) % span;
export const isWeatherEffect = (effect: EffectInstance) => ['snow', 'rain', 'cherryBlossoms', 'petals'].includes(effect.type);

/** Image textures are small moving sprites. A horizontal atlas can supply several particle shapes. */
export class WeatherLayer {
  readonly container = new Container();
  readonly backContainer = new Container();
  private readonly effects = new Map<Id, Weather>();
  constructor(private readonly width: number, private readonly height: number) {}
  private remove(id: Id, current: Weather) {
    current.container.removeFromParent(); current.container.destroy({ children: true });
    for (const frame of current.frames) if (frame !== current.texture) frame.destroy(false);
    this.effects.delete(id);
  }
  sync(effects: EffectInstance[], textures?: ReadonlyMap<Id, Texture>) {
    const active = new Set(effects.filter(effect => isWeatherEffect(effect) && effect.enabled).map(effect => effect.id));
    for (const [id, current] of this.effects) if (!active.has(id)) this.remove(id, current);
    for (const effect of effects) {
      if (!isWeatherEffect(effect) || !effect.enabled) continue;
      let current = this.effects.get(effect.id);
      const texture = effect.resourceId ? textures ? textures.get(effect.resourceId) ?? null : current?.texture ?? null : null;
      if (current && (current.texture !== texture || current.effect.type !== effect.type || current.effect.seed !== effect.seed ||
        current.effect.parameters.columns !== effect.parameters.columns || current.effect.parameters.size !== effect.parameters.size)) { this.remove(effect.id, current); current = undefined; }
      if (!current) {
        const columns = Math.max(1, Math.floor(number(effect.parameters.columns, 1)));
        const frames = texture ? Array.from({ length: columns }, (_, index) => columns === 1 ? texture : new Texture({
          source: texture.source, frame: new Rectangle(index * texture.width / columns, 0, texture.width / columns, texture.height),
        })) : [];
        current = { effect: structuredClone(effect), container: new Container(), particles: [], random: random(effect.seed), texture, frames, mask: null };
        this.effects.set(effect.id, current); this.container.addChild(current.container);
      }
      current.effect = structuredClone(effect);
      const parent = effect.layer === 'back' ? this.backContainer : this.container;
      if (current.container.parent !== parent) parent.addChild(current.container);
      current.container.alpha = effect.fade ? Math.max(0, 1 - effect.fade.elapsedMs / effect.fade.durationMs) : 1;
      current.container.zIndex = number(effect.parameters.z, 0); parent.sortableChildren = true;
      const count = Math.max(0, Math.round((effect.type === 'rain' ? 150 : effect.type === 'snow' ? 200 : 55) * number(effect.parameters.density, 100) / 100));
      while (current.particles.length > count) current.particles.pop()!.sprite.destroy();
      while (current.particles.length < count) {
        const rng = current.random, rain = effect.type === 'rain';
        const frame = current.frames[Math.floor(rng() * current.frames.length)];
        const sprite = frame ? new Sprite(frame) : rain ? new Graphics().rect(-.7, -12, 1.4, 24).fill(0xcde7ff) :
          new Graphics().circle(0, 0, 3).fill(effect.type === 'snow' ? 0xffffff : 0xf3a7bd);
        if (sprite instanceof Sprite) sprite.anchor.set(.5);
        const size = number(effect.parameters.size, rain ? 100 : effect.type === 'snow' ? 12 : 26) * (.55 + rng() * .65);
        if (frame) sprite.scale.set(size / (rain ? frame.height : Math.max(frame.width, frame.height)));
        sprite.alpha = .45 + rng() * .5;
        const particle = { sprite, x: rng() * this.width, y: rng() * this.height, phase: rng() * Math.PI * 2,
          speed: .65 + rng() * .7, size: sprite.scale.x, spin: (rng() - .5) * 1.2 };
        current.container.addChild(sprite); current.particles.push(particle);
      }
      this.position(current);
    }
  }
  private position(current: Weather) {
    const { effect } = current, rain = effect.type === 'rain', petals = ['petals', 'cherryBlossoms'].includes(effect.type);
    const seconds = effect.elapsedMs / 1000 * number(effect.parameters.speed, 100) / 100, speed = rain ? 850 : petals ? 65 : 60;
    const direction = number(effect.parameters.directionDeg, 90) * Math.PI / 180;
    for (const particle of current.particles) {
      const travelled = seconds * speed * particle.speed;
      const sway = rain ? 0 : Math.sin(seconds * .8 + particle.phase) * (petals ? 45 : 18);
      particle.sprite.position.set(wrap(particle.x + Math.cos(direction) * travelled + sway + 100, this.width + 200) - 100,
        wrap(particle.y + Math.sin(direction) * travelled + 120, this.height + 240) - 120);
      particle.sprite.rotation = rain ? direction - Math.PI / 2 : particle.phase + seconds * particle.spin;
      if (petals && particle.sprite instanceof Sprite) particle.sprite.scale.x = particle.size * Math.cos(seconds * 1.1 + particle.phase);
    }
  }
  tick(deltaMs: number) { for (const current of this.effects.values()) { current.effect.elapsedMs += deltaMs; this.position(current); } }
  target(id: Id, rect: { x: number; y: number; width: number; height: number } | null, visible = true) {
    const weather = this.effects.get(id); if (!weather) return;
    weather.container.visible = visible;
    if (!rect) { weather.container.mask = null; weather.mask?.destroy(); weather.mask = null; return; }
    if (!weather.mask) { weather.mask = new Graphics(); weather.container.addChild(weather.mask); }
    weather.mask.clear().rect(rect.x, rect.y, rect.width, rect.height).fill(0xffffff); weather.container.mask = weather.mask;
  }
  capture(): EffectInstance[] { return [...this.effects.values()].map(value => structuredClone(value.effect)); }
  count(effectId: Id) { return this.effects.get(effectId)?.particles.length ?? 0; }
  dispose() { this.sync([]); this.container.destroy(); this.backContainer.destroy(); }
}
