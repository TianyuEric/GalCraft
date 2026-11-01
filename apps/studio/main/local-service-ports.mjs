export const STUDIO_WEB_PORT = 9420;
export const STUDIO_MCP_PORT = 9460;
export const endpointPort = endpoint => Number(new URL(endpoint).port || 80);

/** Explicit ports have the same meaning at CLI and host boundaries. */
export function servicePort(value) {
  if (value === undefined) return undefined;
  const port = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error('Port must be an integer from 1 to 65535.'), { code: 'INVALID_SERVICE_PORT' });
  }
  return port;
}

export function requireServicePort(port, endpoint) {
  port = servicePort(port);
  if (port !== undefined && port !== endpointPort(endpoint)) {
    throw Object.assign(new Error(`Requested port ${port} conflicts with the active service at ${endpoint}. Keep using that address or stop the existing service first.`), { code: 'SERVICE_PORT_CONFLICT', endpoint });
  }
}

/** Bind the real listener; only an occupied candidate permits trying its successor. */
export async function listenLocalService(server, { port, previousPort, defaultPort }) {
  port = servicePort(port);
  const first = port ?? servicePort(previousPort) ?? defaultPort;
  const last = port === undefined ? Math.min(first + 19, 65535) : first;
  for (let candidate = first; candidate <= last; candidate++) {
    try {
      await new Promise((resolve, reject) => {
        const failed = error => { server.off('listening', listening); reject(error); };
        const listening = () => { server.off('error', failed); resolve(); };
        server.once('error', failed); server.once('listening', listening);
        try { server.listen(candidate, '127.0.0.1'); }
        catch (error) { server.off('error', failed); server.off('listening', listening); reject(error); }
      });
      return { port: server.address().port, requestedPort: first };
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || candidate === last) throw error;
    }
  }
}
