import type { Variable } from '@galcraft/contracts';
import { fixtureId } from '@galcraft/contracts/fixtures';
import { components, createOfficialTemplate, packTemplate } from '@galcraft/templates';
import { createCandidateServices } from '../../../review/studio-candidate/application/services.js';
import { createReviewSeed, type Scenario } from '../studio-r0/galcraft/fixtures.js';
import { createCandidateSeed, envelope } from '../../../review/studio-candidate/application/documents.js';
import type { CandidateServicesFactory } from '../../../review/studio-candidate/application/session.js';

export function candidateFixture(scenario: Scenario = 'balanced', theme: 'light' | 'dark' = 'light', options?: Parameters<typeof createCandidateServices>[2]) {
  const seed = createCandidateSeed(createReviewSeed(scenario, theme));
  const createServices: CandidateServicesFactory = host => createCandidateServices(host, theme, options);
  return { seed, createServices };
}

export function templateMappingFixture() {
  const foreignVariable: Variable = {
    id: fixtureId(0xd000), name: '原作品标题', type: 'string', scope: 'longTerm', initial: '原作品的春灯',
  };
  const projectVariable: Variable = {
    id: fixtureId(0xd001), name: '模板映射文案', type: 'string', scope: 'longTerm', initial: '映射后的春灯',
  };
  let nextId = 0xd100;
  const template = createOfficialTemplate({ kind: 'standard' }, () => fixtureId(nextId++));
  template.id = 'org.galcraft.review.template-mapping';
  template.dependencies = template.dependencies.map(dependency =>
    dependency.kind === 'template' ? { ...dependency, id: template.id } : dependency);
  const titlePage = template.pages.find(page => page.key === 'title')!;
  const title = components(titlePage.root).find(component => component.part === 'title.workTitle')!;
  title.bindings = { ...title.bindings, text: { source: 'variable', scope: foreignVariable.scope, variableId: foreignVariable.id } };
  const templatePackage = packTemplate({
    template, name: '春灯 · 标题变量模板', description: '将原作品的标题变量映射到当前作品。',
    files: {}, assetFiles: {}, variables: [foreignVariable],
  });
  const fixture = candidateFixture('balanced', 'light', { templatePackages: [templatePackage] });
  fixture.seed.documents.push(envelope(fixtureId(0xd002), `variables/${projectVariable.id}.json`, projectVariable));
  return fixture;
}
