import type { ProductionOperationDefinition, Result } from '@galcraft/contracts';
import type { MediaInput } from '@galcraft/authoring/production';

type Port = ProductionOperationDefinition['inputs'][number];
export function productionPortReferences(references: MediaInput[], inputs: Port[], key: string): MediaInput[] {
  const singleMediaPort = inputs.filter(port => port.type !== 'text').length === 1;
  return references.filter(reference => reference.port ? reference.port === key : singleMediaPort);
}
export function addProductionPortReference(references: MediaInput[], inputs: Port[], port: Port, value: MediaInput): Result<MediaInput[]> {
  const kind = value.kind ?? /^(image|audio|video)\//.exec(value.mime)?.[1];
  let message = '';
  if (kind !== port.type) message = `端口 ${port.key} 类型不兼容：${kind ?? value.mime} → ${port.type}`;
  else if (port.typeVersion && value.typeVersion !== port.typeVersion) message = `端口 ${port.key} 类型版本不兼容`;
  else if (port.mimeTypes.length && !port.mimeTypes.includes(value.mime)) message = `端口 ${port.key} 不接受 ${value.mime}`;
  if (message) {
    const error = { code: 'PRODUCTION_INPUT', severity: 'error' as const, owner: 'M10' as const, message, related: [], actions: ['edit' as const] };
    return { ok: false, error, issues: [error] };
  }
  const current = productionPortReferences(references, inputs, port.key);
  return { ok: true, value: [...references.filter(reference => port.multiple || !current.includes(reference)), { ...value, port: port.key }], warnings: [] };
}
