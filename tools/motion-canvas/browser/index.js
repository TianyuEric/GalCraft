import {Renderer, Player, Vector2} from '@motion-canvas/core';

// The documented Renderer/Exporter APIs provide frame rendering without editor clicks.
export async function editor(project) {
  try {
    project.logger.onLogged.subscribe(entry => window.motionEvent({kind: 'log', ...entry}));
    const settings = await window.motionSettings();
    for (const resource of settings.resources) {
      if (resource.purpose === 'font') {
        document.fonts.add(await new FontFace(resource.family, `url(${resource.uri})`).load());
        await window.motionEvent({kind: 'resources', alias: resource.alias, font: document.fonts.check(`32px ${resource.family}`)});
      } else if (resource.purpose === 'image') {
        const image = new Image(); image.src = resource.uri; await image.decode();
        await window.motionEvent({kind: 'resources', alias: resource.alias, image: [image.naturalWidth, image.naturalHeight]});
      }
    }
    await document.fonts.ready;
    const validation = new Player(project, {fps: settings.fps, size: new Vector2(settings.width, settings.height)});
    await new Promise(resolve => validation.onRecalculated.subscribe(resolve));
    const sourceFrames = validation.onDurationChanged.current;
    validation.deactivate();
    // Motion Canvas adds one terminal generator frame to the sampled timeline.
    await window.motionEvent({kind: 'duration', sourceFrames, sampledFrames: sourceFrames - 1, expectedFrames: settings.frames});
    if (sourceFrames - 1 !== settings.frames) throw new Error(`Scene duration ${sourceFrames - 1} sampled frames does not match output ${settings.frames} frames`);
    const exporter = {
      id: 'org.galcraft.motion-canvas/frames', displayName: 'GalCraft host frames',
      async create() {
        return {
          async start() { await window.motionEvent({kind: 'phase', stage: 'rendering'}); },
          async handleFrame(canvas, frame, _sceneFrame, sceneName, signal) {
            if (!signal.aborted) await window.motionFrame({frame, sceneName, png: canvas.toDataURL('image/png').split(',')[1]});
          },
          async stop(result) { await window.motionEvent({kind: 'render-finished', result}); },
        };
      },
    };
    project.meta.rendering.exporter.exporters.push(exporter);
    const renderer = new Renderer(project);
    window.motionAbort = () => renderer.abort();
    renderer.onFinished.subscribe(result => window.motionEvent({kind: 'finished', result}));
    await window.motionEvent({kind: 'phase', stage: 'calculating'});
    await renderer.render({name: 'motion', range: [0, (settings.frames - 1) / settings.fps], fps: settings.fps,
      size: new Vector2(settings.width, settings.height), resolutionScale: 1, colorSpace: 'srgb', background: '#172c41',
      exporter: {name: exporter.id, options: {}}});
  } catch (error) {
    await window.motionEvent({kind: 'failure', message: String(error), stack: error?.stack});
  }
}
