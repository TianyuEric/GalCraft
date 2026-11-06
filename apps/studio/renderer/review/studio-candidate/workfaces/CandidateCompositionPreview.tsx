import { ImageOff } from 'lucide-react';
import { resolveCompositionLayer, type AppearanceResources, type CandidateSceneComposition } from '../adapters/appearance-composition.js';

export function CandidateCompositionPreview({ name, composition, resources }: {
  name: string; composition: CandidateSceneComposition; resources: AppearanceResources;
}) {
  const { width, height } = composition;
  const layers = composition.layers.map(layer => resolveCompositionLayer(layer, resources));
  const missing = layers.filter(layer => !layer.image);
  return <figure className="candidate-appearance-preview">
    <div className="candidate-appearance-canvas">
      {layers.some(layer => layer.image) ? <svg role="img" aria-label={name + ' · 组合预览'} viewBox={`0 0 ${width} ${height}`}>
        {layers.filter(layer => layer.image).map(layer => <image key={layer.id} href={layer.image}
          x={layer.x} y={layer.y} width={layer.width} height={layer.height} preserveAspectRatio="none"/>)}
      </svg> : <div className="candidate-appearance-canvas-empty"><ImageOff size={20} aria-hidden="true"/>
        <span>{missing.length ? '图层素材不可用' : '当前组合没有可见图层'}</span></div>}
    </div>
    <figcaption><span>静态预览</span><span>{width} × {height} px</span></figcaption>
    {!!missing.length && <p role="status">找不到图层素材。{missing.map(layer => layer.name ?? layer.id).join('、')}</p>}
  </figure>;
}
