import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BuildReceiptSchema, IdSchema, ReleaseManifestSchema, type BuildReceipt } from '@galcraft/contracts';

export class BuildReceipts {
  private readonly directory: string;
  constructor(directory: string) { this.directory = directory; }

  private manifest(receipt: BuildReceipt) {
    const manifest = ReleaseManifestSchema.parse(JSON.parse(readFileSync(join(receipt.outputDirectory, 'release.manifest.json'), 'utf8')));
    if (manifest.projectId !== receipt.projectId || manifest.target !== receipt.target || manifest.version !== receipt.releaseVersion ||
        resolve(receipt.outputDirectory, manifest.entry) !== resolve(receipt.entry) ||
        resolve(receipt.outputDirectory, 'README.html') !== resolve(receipt.instructionsPath))
      throw new Error('发行清单与构建回执不一致');
    return manifest;
  }

  async record(planId: string, receipt: BuildReceipt): Promise<void> {
    const path = join(this.directory, `${IdSchema.parse(planId)}.json`);
    const { builtAt } = this.manifest(receipt);
    await mkdir(this.directory, { recursive: true });
    const temp = `${path}.tmp`;
    await writeFile(temp, JSON.stringify({ receipt, builtAt }));
    await rename(temp, path);
  }

  read(planId: string, projectId: string): BuildReceipt | null {
    if (!IdSchema.safeParse(planId).success) return null;
    try {
      const { receipt: raw, builtAt } = JSON.parse(readFileSync(join(this.directory, `${planId}.json`), 'utf8'));
      const receipt = BuildReceiptSchema.parse(raw);
      return receipt.projectId === projectId && this.manifest(receipt).builtAt === builtAt ? receipt : null;
    } catch {
      return null;
    }
  }
}
