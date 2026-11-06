import type { Result } from '@galcraft/contracts';
import type { ProductionBridge } from '../../../../desktop-bridge.js';
import { taskError } from './task-model.js';

const unavailable = async <T>(): Promise<Result<T>> =>
  taskError('PAGE_STRUCTURE_DEFERRED', '页面结构在页面设计器中手工编辑。UI 位图和 SVG 可通过素材制作生成并入库。');

// The candidate workbench still conforms to the desktop bridge.
export const candidatePageStructureUnavailable = {
  prepareUIPlan: unavailable,
  confirmUIPlan: unavailable,
  saveComposition: unavailable,
  previewComposition: unavailable,
  prepareUIAdoption: unavailable,
} satisfies Pick<ProductionBridge, 'prepareUIPlan' | 'confirmUIPlan' | 'saveComposition' | 'previewComposition' | 'prepareUIAdoption'>;
