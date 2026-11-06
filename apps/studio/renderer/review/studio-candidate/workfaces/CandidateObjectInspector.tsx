import { readTemplateDocuments } from '@galcraft/templates';
import { useCandidate, useCandidateState } from '../application/context.js';
import { CandidateButton, CandidateSection, CandidateSourceStatus, CandidateState } from '../components/controls/index.js';
import { CandidateInspectorView } from './CandidateInspectorView.js';
import { CandidatePageInspector, candidatePageTitle, candidatePageResourceTitle } from './CandidatePagesView.js';

/** Inspector follows the editing object; explicitly pinned script and object sources win. */
export function CandidateObjectInspector({ onOpen }: { onOpen: (viewId: string) => void }) {
  const store = useCandidate(), { project } = useCandidateState();
  const origin = store.inspectorView(), fixed = store.viewState<string>('inspector:fixedObject');
  if (!origin || /^(writing|source|commands|professional):/.test(origin)) return <CandidateInspectorView onOpen={onOpen}/>;
  const template = readTemplateDocuments(store.host.list());
  const page = origin.startsWith('page:') && template.pages.find(item => item.key === origin.slice(5));
  const character = origin.startsWith('character:') && project.characters.find(item => item.id === origin.slice(10));
  const object = origin.startsWith('page:') || origin.startsWith('character:');
  const resource = origin.startsWith('page:') ? candidatePageResourceTitle(origin.slice(5), template) : undefined;
  const title = page ? candidatePageTitle(page, store.controller.preferences.locale, template.locales) : character ? character.name
    : resource;
  const available = !!title;
  return <div className="candidate-object-inspector">
    {object && <CandidateSourceStatus label="属性来源" name={title ?? '对象已移除或关闭'} mode={!available ? 'missing' : fixed ? 'fixed' : 'following'}
      modeLabel={fixed ? '固定来源' : '跟随编辑对象'} diagnostic={!available ? '可恢复跟随，或从目录重新打开对象。' : undefined}
      locate={available ? { label: '定位来源', run: () => onOpen(origin) } : undefined}
      changeMode={{ label: fixed ? '恢复跟随' : '固定来源', run: () => store.pinInspectorObject(fixed ? undefined : origin) }}/>}
    {page ? <CandidatePageInspector viewId={origin}/> : character ? <CandidateSection title="角色属性">
      <dl className="candidate-object-facts"><dt>角色</dt><dd>{character.name}</dd><dt>编辑位置</dt><dd>资料、共同差分、组合外观和个人路线</dd></dl>
      <CandidateButton onClick={() => onOpen(origin)}>打开角色编辑</CandidateButton>
    </CandidateSection> : resource ? <CandidateSection title="界面资源"><p>{resource}的配置和预览位于当前工作面。</p><CandidateButton onClick={() => onOpen(origin)}>打开资源编辑</CandidateButton></CandidateSection> : <CandidateSection title="属性"><CandidateState kind="empty" title={object ? '没有可显示的对象属性' : '在工作面中继续当前任务'}
      description={object ? '从目录选择一个现有对象。' : '属性会跟随文稿、页面或角色中的实际编辑对象。'}/></CandidateSection>}
  </div>;
}
