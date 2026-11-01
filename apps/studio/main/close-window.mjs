export function installStudioClose(window, dialog, projects, assets, ipcMain) {
  let closing = false;
  let pending = false;
  let requestId = 0;
  let rendererReply = null;
  const webContents = ipcMain ? window.webContents : null;
  const reply = (event, id, response) => {
    if (!rendererReply || event.sender !== webContents || id !== rendererReply.id) return;
    const waiting = rendererReply;
    rendererReply = null;
    if (response?.error) { waiting.reject(new Error(response.error)); return; }
    if (!['save', 'discard', 'cancel'].includes(response?.choice)) {
      if (response?.choice === null) { waiting.reject(new Error('编辑界面的关闭准备尚未就绪')); return; }
      waiting.reject(new Error('关闭准备返回了无效的选择')); return;
    }
    waiting.resolve(response.choice);
  };
  const rendererStopped = () => {
    const waiting = rendererReply;
    rendererReply = null;
    waiting?.reject(new Error('编辑界面已停止，关闭准备尚未完成'));
  };
  const requestClose = event => {
    if (event.sender === webContents && !closing) window.close();
  };
  if (ipcMain) {
    ipcMain.on('studio:closePrepared', reply);
    ipcMain.on('studio:requestClose', requestClose);
    webContents.on('render-process-gone', rendererStopped);
    window.once('closed', () => {
      ipcMain.removeListener('studio:closePrepared', reply);
      ipcMain.removeListener('studio:requestClose', requestClose);
      webContents.removeListener('render-process-gone', rendererStopped);
      rendererStopped();
    });
  }
  const prepareRenderer = () => !ipcMain ? Promise.resolve(null) : new Promise((resolve, reject) => {
    const id = ++requestId;
    rendererReply = { id, resolve, reject };
    try { webContents.send('studio:closeRequested', id); }
    catch (error) { rendererReply = null; reject(error); }
  });
  window.on('close', event => {
    if (closing) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    void (async () => {
      const preparedChoice = await prepareRenderer();
      if (preparedChoice === 'cancel') return;
      const sessionId = projects.currentSessionId;
      if (sessionId) {
        let choice = preparedChoice ?? 'save';
        if (preparedChoice === null && projects.currentSession.dirtyIds().length) {
          const decision = await dialog.showMessageBox(window, {
            type: 'question', message: '作品有未保存的修改',
            detail: '关闭前保存修改，或明确舍弃本次修改。',
            buttons: ['保存并关闭', '舍弃修改', '取消'], defaultId: 0, cancelId: 2,
          });
          if (decision.response === 2) return;
          choice = decision.response === 0 ? 'save' : 'discard';
        }
        const projectId = projects.currentSession.projectId;
        const result = await projects.close(sessionId, choice);
        if (!result.ok) {
          await dialog.showMessageBox(window, {
            type: 'error', message: '作品尚未关闭', detail: result.error.message,
            buttons: ['确定'],
          });
          return;
        }
        const discarded = await assets?.discardPending(projectId);
        if (discarded && !discarded.ok) {
          await dialog.showMessageBox(window, { type: 'error', message: '素材准备项尚未清理',
            detail: discarded.error.message, buttons: ['确定'] });
          return;
        }
      }
      if (!sessionId) {
        const discarded = await assets?.discardPending();
        if (discarded && !discarded.ok) {
          await dialog.showMessageBox(window, { type: 'error', message: '素材准备项尚未清理',
            detail: discarded.error.message, buttons: ['确定'] });
          return;
        }
      }
      closing = true;
      window.close();
    })().catch(async error => {
      await dialog.showMessageBox(window, {
        type: 'error', message: '作品尚未关闭', detail: String(error), buttons: ['确定'],
      });
    }).finally(() => { pending = false; });
  });
}
