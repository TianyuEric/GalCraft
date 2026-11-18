import { issueFromError, type AssetImportBatch, type Issue, type Result } from '@galcraft/contracts';
import type { ProductionProblemSnapshot } from '@galcraft/authoring/production';
import { mergeProductionProblems } from './problem-sources.js';

type ProblemMonitorPorts = {
  imports?: () => Promise<Result<AssetImportBatch[]>>;
  production?: () => Promise<Result<ProductionProblemSnapshot>>;
};
const sameContent = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Reads retained problem sources for one project. Navigation, notifications and ignore state stay with the workbench. */
export class ProblemMonitor {
  imports: AssetImportBatch[] = [];
  production: ProductionProblemSnapshot | null = null;
  importIssue: Issue | null = null;
  productionIssue: Issue | null = null;
  loading = false;

  private epoch = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private initialized = false;

  constructor(readonly projectId: string, private readonly ports: ProblemMonitorPorts, private readonly changed: () => void) {}

  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.ports.imports && !this.ports.production) return Promise.resolve();
    const epoch = this.epoch;
    let sourceChanged = false;
    this.loading = true;
    const request = Promise.resolve().then(async () => {
      if (epoch !== this.epoch) return;
      const reads: Promise<boolean>[] = [];
      if (this.ports.imports) reads.push(this.readImports(this.ports.imports, epoch));
      if (this.ports.production) reads.push(this.readProduction(this.ports.production, epoch));
      sourceChanged = (await Promise.all(reads)).some(Boolean);
    }).finally(() => {
      if (epoch !== this.epoch || this.inFlight !== request) return;
      this.inFlight = null;
      this.loading = false;
      const notify = !this.initialized || sourceChanged;
      this.initialized = true;
      if (notify) this.changed();
    });
    this.inFlight = request;
    return request;
  }

  start(): void {
    if (this.timer !== null || (!this.ports.imports && !this.ports.production)) return;
    this.timer = setInterval(() => { void this.refresh(); }, 1800);
    void this.refresh();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.epoch++;
    this.inFlight = null;
    this.loading = false;
  }

  private async readImports(read: NonNullable<ProblemMonitorPorts['imports']>, epoch: number): Promise<boolean> {
    let imports = this.imports, importIssue: Issue | null = null;
    try {
      const result = await read();
      if (epoch !== this.epoch) return false;
      if (!result.ok) importIssue = result.error;
      else if (result.value.some(batch => batch.projectId !== this.projectId)) {
        importIssue = { code: 'IMPORT_PROBLEMS_PROJECT_MISMATCH', severity: 'error', owner: 'M04',
          message: 'Import problem results belong to a different project.', related: [], actions: ['retry'],
          details: { expectedProjectId: this.projectId, receivedProjectIds: [...new Set(result.value.map(batch => batch.projectId))] } };
      } else {
        const current = new Map(this.imports.map(batch => [batch.id, batch]));
        imports = result.value.map(batch => {
          const previous = current.get(batch.id);
          return previous && previous.revision >= batch.revision ? previous : batch;
        });
      }
    } catch (error) {
      if (epoch !== this.epoch) return false;
      importIssue = issueFromError(error, 'M04');
    }
    const importsChanged = !sameContent(this.imports, imports), issueChanged = !sameContent(this.importIssue, importIssue);
    if (importsChanged) this.imports = imports;
    if (issueChanged) this.importIssue = importIssue;
    return importsChanged || issueChanged;
  }

  private async readProduction(read: NonNullable<ProblemMonitorPorts['production']>, epoch: number): Promise<boolean> {
    let production = this.production, productionIssue: Issue | null = null;
    try {
      const result = await read();
      if (epoch !== this.epoch) return false;
      if (!result.ok) productionIssue = result.error;
      else if (result.value.projectId !== this.projectId) {
        productionIssue = { code: 'PRODUCTION_PROBLEMS_PROJECT_MISMATCH', severity: 'error', owner: 'M10',
          message: 'Production problem results belong to a different project.', related: [], actions: ['retry'],
          details: { expectedProjectId: this.projectId, receivedProjectId: result.value.projectId } };
      } else {
        production = mergeProductionProblems(this.production, result.value);
      }
    } catch (error) {
      if (epoch !== this.epoch) return false;
      productionIssue = issueFromError(error, 'M10');
    }
    const productionChanged = !sameContent(this.production, production), issueChanged = !sameContent(this.productionIssue, productionIssue);
    if (productionChanged) this.production = production;
    if (issueChanged) this.productionIssue = productionIssue;
    return productionChanged || issueChanged;
  }
}
