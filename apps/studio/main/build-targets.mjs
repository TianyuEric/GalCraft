import { loadPluginServices } from '@galcraft/plugins/host';
import {validatePluginData} from '@galcraft/plugins';
import { resolve } from 'node:path';
import { fail, ok } from './result.mjs';

/** M11 consumes M09's exact installed service packages; target packages never enter the work's runtime Lock. */
export class StudioBuildTargets {
  constructor(packages, session, progress = () => {}) { Object.assign(this, { packages, session, progress }); this.preparations = new Map(); this.preparationDirectories = new Set(); }
  async acquire(selection) {
    if (!this.packages || !selection?.pluginId || !selection?.version || !selection?.key) throw new Error('请选择实际目录中的构建器精确版本');
    const exact = await this.packages.exactDirectory(selection.pluginId, selection.version);
    if (!exact.ok) throw new Error(exact.error.message);
    const { directory, manifest } = exact.value;
    const declaration = manifest.contributions.find(item => item.kind === 'targetBuilder' && item.key === selection.key);
    if (!declaration || declaration.targets.length !== 1 || !manifest.entry.services) throw new Error('目标包需要唯一目标声明和真实服务入口');
    const instance = await loadPluginServices(directory, manifest);
    try {
      const offered = await instance.activate(this.packages.context(manifest.id, declaration.targets[0], this.session()));
      const matches = offered.targetBuilders?.filter(item => item.key === selection.key) ?? [];
      if (matches.length !== 1 || matches[0].version !== selection.version || matches[0].target !== declaration.targets[0]) throw new Error('构建器实现与清单精确身份或目标不一致');
      return { provider: matches[0], release: () => instance.deactivate() };
    } catch (error) { await instance.deactivate(); throw error; }
  }
  async catalog() {
    const entries = [], warnings = [];
    if (!this.packages) return ok(entries);
    const installed = await this.packages.list(this.session());
    if (!installed.ok) return installed;
    const providers = new Map(this.packages.dependencies(this.session()).map(item => [`${item.id}@${item.version}`, item]));
    for (const entry of installed.value.entries) providers.set(`${entry.manifest.id}@${entry.manifest.version}`, entry.manifest);
    for (const dependency of providers.values()) {
      const exact = await this.packages.exactDirectory(dependency.id, dependency.version);
      if (!exact.ok) { warnings.push(exact.error); continue; }
      for (const declaration of exact.value.manifest.contributions.filter(item => item.kind === 'targetBuilder')) {
        const identity = { key: declaration.key, pluginId: dependency.id, version: dependency.version };
        let lease;
        try { lease = await this.acquire(identity); entries.push({ description: await lease.provider.describe(), builder: identity }); }
        catch (error) { warnings.push({ code: 'BUILD_TARGET_UNAVAILABLE', owner: 'M11', severity: 'warning', message: String(error), related: [], actions: ['supplyDependency'] }); }
        finally { await lease?.release(); }
      }
    }
    return { ok: true, value: entries, warnings };
  }
  async detect({ builder, input }) {
    let lease; try { lease = await this.acquire(builder); return await lease.provider.detect(input); }
    catch (error) { return fail('BUILD_TOOLS_DETECT', String(error), 'M11'); } finally { await lease?.release(); }
  }
  async prepare({ builder, input, operationId }) {
    if (!operationId || this.preparations.has(operationId)) return fail('BUILD_TOOLS_BUSY', '准备操作身份缺失或正在运行', 'M11');
    const directory = resolve(input.directory);
    if (this.preparationDirectories.has(directory)) return fail('BUILD_TOOLS_BUSY', '所选目录正在准备工具，请等待完成或取消原操作', 'M11');
    this.preparationDirectories.add(directory);
    const controller = new AbortController(); this.preparations.set(operationId, controller);
    let lease; try { lease = await this.acquire(builder); return await lease.provider.prepare(input, { signal: controller.signal, progress: event => this.progress({ operationId, ...event }) }); }
    catch (error) { return fail('BUILD_TOOLS_PREPARE', String(error), 'M11'); }
    finally { await lease?.release(); this.preparations.delete(operationId); this.preparationDirectories.delete(directory); }
  }
  cancel(operationId) { const controller = this.preparations.get(operationId); controller?.abort(); return ok({ cancelled: !!controller }); }
  async validate(input) {
    let lease; try { lease = await this.acquire(input.targetBuilder);
      if (lease.provider.target !== input.target) throw new Error('所选构建器与发行目标不一致');
      const checked=validatePluginData((await lease.provider.describe()).optionsSchema,input.targetOptions??null);if(!checked.ok)return checked.issues;
      return await lease.provider.validate(input.targetOptions ?? null, input);
    } catch (error) { return [{ code: 'BUILD_TARGET_UNAVAILABLE', owner: 'M11', severity: 'error', message: String(error), related: [], actions: ['chooseTarget'] }]; }
    finally { await lease?.release(); }
  }
  async build(input, signal) {
    let lease; try { lease = await this.acquire(input.plan.input.targetBuilder);
      if (lease.provider.target !== input.plan.input.target) throw new Error('冻结计划与精确目标构建器不匹配');
      const checked=validatePluginData((await lease.provider.describe()).optionsSchema,input.options);if(!checked.ok)return checked;
      return await lease.provider.build(input, { signal, progress: event => this.progress({ operationId: input.plan.planId, ...event }) });
    } catch (error) { return fail('BUILD_TARGET_FAILED', String(error), 'M11'); } finally { await lease?.release(); }
  }
  dispose() { for (const controller of this.preparations.values()) controller.abort(); }
}
