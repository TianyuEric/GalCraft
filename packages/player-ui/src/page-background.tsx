import type { PageConfig, PlayerHost, Snapshot } from '@galcraft/contracts';
import { ResourceImage } from './resource-image.js';

/** Decorative background only; layout and story input retain their design canvas. */
export function PageBackground({ host, snapshot, page, opacity }: {
  host: PlayerHost; snapshot: Snapshot; page: PageConfig | undefined; opacity?: number;
}) {
  if (!page) return null;
  const background = page.background;
  return <div className="gc-page-background-fill" data-gc-page={page.key} data-gc-part={`${page.key}.background`} data-gc-component={page.root.children.find(item=>item.part===`${page.key}.background`)?.id} aria-hidden="true" style={{
    backgroundColor: `color-mix(in srgb, ${background.color} ${(opacity ?? background.colorOpacity) * 100}%, transparent)`,
  }}>
    {background.imageId && <div className="gc-page-background-picture" style={{ opacity: background.imageOpacity }}>
      <ResourceImage host={host} asset={snapshot.assets.find(asset => asset.assetId === background.imageId)} alt="" style={{
        objectFit: background.fit === 'native' ? 'none' : background.fit,
        objectPosition: `${background.positionX * 100}% ${background.positionY * 100}%`,
      }}/>
    </div>}
  </div>;
}
