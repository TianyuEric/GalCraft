import { createRequire } from 'node:module';
import { createSteamSdkProvider } from './index.mjs';
let provider, timer;
const close = () => { clearInterval(timer); if (process.connected) process.disconnect(); process.exit(0); };
process.on('disconnect', close);
process.on('message', async message => {
  if (message.type === 'init') {
    try {
      const sdk = createRequire(import.meta.url)('./steamworksjs.win32-x64-msvc.node');
      sdk.init(message.appId);
      timer = setInterval(() => sdk.runCallbacks(), 1000 / 30);
      provider = createSteamSdkProvider({ setAchievement: id => sdk.achievement.activate(id), storeStats: () => sdk.stats.store() });
      process.send({ type: 'ready' });
    } catch (error) { process.send({ type: 'error', message: String(error.message ?? error) }); }
  } else if (message.type === 'invoke' && provider) process.send({ type: 'result', id: message.id, result: await provider.invoke(message.action, message.args) });
  else if (message.type === 'close') close();
});
process.send?.({ type: 'loaded' });
