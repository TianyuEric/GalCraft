process.parentPort.once('message', event => {
  const [port] = event.ports;
  const input = event.data.input;
  const timer = setTimeout(() => {
    port.postMessage({ type: 'result', value: { received: input.value } });
    setTimeout(() => process.exit(0), 100);
  }, input.delayMs ?? 0);
  port.on('message', message => {
    if (message.data?.type === 'cancel') {
      clearTimeout(timer);
      process.exit(0);
    }
  });
  port.start();
});
