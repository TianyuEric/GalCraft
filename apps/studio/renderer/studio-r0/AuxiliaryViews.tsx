import { useRef, useState } from 'react';
import { Check, FileText, Image, Music, Pin, Search, Settings2 } from 'lucide-react';
import { useReview, useReviewState } from './context.js';
import { expressionNames, sourceTitle } from './model.js';
export function AssetsView({
  onOpen
}: {
  onOpen(id: string): void;
}) {
  const store = useReview(),
    {
      project,
      ui
    } = useReviewState(),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<string | null>(null),
    audio = useRef<HTMLAudioElement>(null);
  const source = store.source('assets'),
    character = project.characters.find(c => c.id === (source.characterId ?? source.id));
  const assets = project.assets.filter(a => (filter === 'all' || a.kind === filter) && (!query || a.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  return <div className="gc-r0-assets"><div className="gc-r0-view-toolbar"><span>素材浏览器</span><span className="gc-r0-spacer" /><button aria-label={ui.pins.assets ? '取消素材来源固定' : '固定素材来源'} aria-pressed={!!ui.pins.assets} onClick={() => store.pin('assets')}><Pin size={14} /></button></div>
    <div className="gc-r0-source-label">{ui.pins.assets ? '固定' : '跟随'} · {sourceTitle(project, source)}</div>
    <div className="gc-r0-assets-search"><Search size={14} /><input aria-label="搜索素材" placeholder="搜索名称、角色…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="素材类型" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部</option><option value="image">图片</option><option value="audio">音频</option></select></div>
    <div className="gc-r0-asset-grid">{assets.map(asset => <button key={asset.id} className={selected === asset.id ? 'is-selected' : ''} draggable onDragStart={e => {
        e.dataTransfer.setData('application/x-galcraft-asset', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }} onClick={() => {
        setSelected(asset.id);
        if (asset.characterId) store.select({
          kind: 'character',
          id: asset.characterId,
          documentId: asset.characterId
        });
      }} onDoubleClick={() => {
        if (asset.characterId) onOpen('character');
      }} title={asset.name}>
      {asset.kind === 'image' ? <img src={asset.url} alt="" loading="lazy" /> : <Music size={30} />}<span>{asset.name}</span></button>)}{!assets.length && <div className="gc-r0-empty"><Image size={24} /><strong>{query ? '没有匹配的素材' : '素材库为空'}</strong><p>{query ? '换一个名称试试。' : '可以从素材制作工作面生成审核样例。'}</p><button onClick={() => onOpen('production')}>打开素材制作</button></div>}</div>
    <div className="gc-r0-view-toolbar"><small>{assets.length} 项{character ? ` · ${character.name}` : ''}</small><span className="gc-r0-spacer" />{selected && <button onClick={() => {
        const asset = project.assets.find(a => a.id === selected);
        if (!asset) return;
        if (asset.kind === 'audio') {
          if (audio.current) {
            audio.current.src = asset.url;
            void audio.current.play().catch(() => store.notice('浏览器暂时无法播放此音频'));
          }
        } else if (asset.characterId && asset.expression) {
          store.edit('将素材用于当前场景', p => {
            const appearance = p.scenes.find(s => s.id === ui.sceneId)?.cast[asset.characterId!];
            if (appearance) appearance.expression = asset.expression!;
          });
          onOpen('stage');
          store.notice(`已将${asset.name}用于当前场景`);
        }
      }}>用于当前场景</button>}<button onClick={() => onOpen('production')}>制作素材</button></div><audio ref={audio} controls hidden />
  </div>;
}
export function SettingsView() {
  const store = useReview(),
    {
      ui
    } = useReviewState(),
    [section, setSection] = useState('外观'),
    [scale, setScale] = useState('标准'),
    [motion, setMotion] = useState(false);
  return <div className="gc-r0-settings"><aside>{['外观', '编辑', '快捷键', '审核服务'].map(item => <button className={section === item ? 'is-selected' : ''} onClick={() => setSection(item)} key={item}>{item}</button>)}</aside><div className="gc-r0-settings-body"><Settings2 size={22} /><h2>{section}</h2>
    {section === '外观' ? <><p>编辑器主题独立于作品画面。</p><label>主题<select value={ui.theme} onChange={e => store.updateUi(u => {
            u.theme = e.target.value as typeof ui.theme;
          })}><option value="light">浅色</option><option value="dark">深色</option></select></label><label>文稿密度<select value={scale} onChange={e => {
            setScale(e.target.value);
            e.currentTarget.closest<HTMLElement>('.gc-r0')?.style.setProperty('--gc-r0-writing-size', e.target.value === '舒适' ? '15px' : '14px');
          }}><option>标准</option><option>舒适</option></select></label><label className="gc-r0-check"><input type="checkbox" checked={motion} onChange={e => {
            setMotion(e.target.checked);
            e.currentTarget.closest<HTMLElement>('.gc-r0')?.setAttribute('data-reduced-motion', String(e.target.checked));
            store.notice(e.target.checked ? '已在本次审核中减少动态效果' : '已恢复标准动态效果');
          }} />减少界面动态效果</label></> : section === '编辑' ? <><p>文稿按段落编辑。Enter 拆句，Backspace 在句首合并；句内事件随文字位置更新。</p><p>舞台跟随当前编辑位置，属性跟随选中对象。面板右上角的图钉可独立固定来源。</p><p>文档标签固定保留标签；它不会固定面板的来源。</p></> : section === '快捷键' ? <dl>{[['打开命令', 'Ctrl K'], ['保存到审核会话', 'Ctrl S'], ['撤销 / 重做', 'Ctrl Z / Ctrl Shift Z'], ['预览 / 暂停', 'F5'], ['关闭命令或浮层', 'Esc'], ['文稿拆句', 'Enter'], ['定位句内事件', '点击事件标记']].map(([name, key]) => <div key={name}><dt>{name}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl> : <><p>当前为 Storybook 审核会话。作品、历史和布局在此浏览器中可操作。</p><ul><li>保存：会话内存服务，未写入磁盘。</li><li>素材制作：确定性教学素材，未调用 AI。</li><li>PSD：确定性图层输入，未解析磁盘 PSD。</li><li>舞台：GalCraft 当前舞台渲染能力。</li><li>源码：审核文稿适配；正式句内事件持久化沿 R1。</li><li>独立系统窗口、同稿双写作实例：后续批次。</li></ul></>}
  </div></div>;
}
export function ProjectOverview({
  onOpen
}: {
  onOpen(id: string): void;
}) {
  const store = useReview(),
    {
      project,
      ui
    } = useReviewState();
  return <div className="gc-r0-overview"><FileText size={32} /><p className="gc-r0-eyebrow">GALCRAFT · 当前作品</p><h1>{project.name}</h1><p>从一句对白开始，把文字、画面和角色放在同一个创作空间。</p><div className="gc-r0-overview-actions"><button className="gc-r0-primary" onClick={() => onOpen(`writing:${ui.sceneId}`)}>继续写作</button><button onClick={() => onOpen('page')}>编辑开始界面</button></div><h3>场景</h3>{project.scenes.map(scene => <button className="gc-r0-overview-row" key={scene.id} onClick={() => onOpen(`writing:${scene.id}`)}><FileText size={16} /><span>{scene.name}</span><small>{scene.lines.length} 句</small></button>)}<h3>角色</h3>{project.characters.map(c => <button className="gc-r0-overview-row" key={c.id} onClick={() => {
      store.select({
        kind: 'character',
        documentId: c.id,
        id: c.id
      });
      onOpen('character');
    }}><img src={`/practice/figures/${c.prefix}-neutral.png`} alt="" /><span>{c.name}</span><small>{expressionNames[c.expression]}</small></button>)}<p className="gc-r0-service-note"><Check size={13} />审核内容独立于磁盘作品。</p></div>;
}
