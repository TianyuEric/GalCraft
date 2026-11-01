// Native-capability test fixture for the same Storybook components.
// It deliberately does not expose Studio IPC, M02, disk persistence, or Player.
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const window = new BrowserWindow({width:1440,height:940,title:'GalCraft · 候选原生验证',webPreferences:{contextIsolation:true,nodeIntegration:false}});
  window.setMenu(null);
  window.webContents.on('page-title-updated', event => event.preventDefault());
  window.loadURL(`${process.env.STORYBOOK_URL || 'http://127.0.0.1:6007'}/iframe.html?id=product-studio-component-comparison-batch-1--try-candidates&viewMode=story`);
});
app.on('window-all-closed', () => app.quit());
