import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Undo2, Moon, Sun } from 'lucide-react';
import { Button, Choice } from '../../components/controls.js';
import { ColorField } from '../../components/color-field.js';
import { ColorAlpha } from '../../components/color-alpha.js';
import { NumberField } from '../../components/ui/number-field.js';
import { CandidateColorField } from './CandidateColorField.js';
import { CandidateNumberField } from './CandidateNumberField.js';
import { CandidateObjectPicker, objectKey, type ProjectObject } from './CandidateObjectPicker.js';
import { parseColorString, rgbToHex } from '../../components/editor-fields/vendor/dice-color-picker.js';
import { FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import '../../authoring/pilot.css';
import './comparison.css';

export const comparisonObjects: ProjectObject[] = [
  {id:FixtureIds.background,variantId:fixtureId(3328),revision:1,name:'雨站',path:'背景 / 第一章 / 雨后',type:'图像',thumbnail:'/practice/backgrounds/spring-station.png'},
  {id:fixtureId(0xc01),variantId:fixtureId(3329),revision:1,name:'雨站',path:'背景 / 第二章 / 傍晚',type:'图像',thumbnail:'/practice/backgrounds/spring-station.png'},
  {id:fixtureId(0xc02),variantId:fixtureId(3330),revision:1,name:'旧街转角 · 雨停后灯光映在玻璃上的傍晚（最终修订）',path:'背景 / 第一章 / 长名称场景',type:'图像',thumbnail:'/practice/backgrounds/spring-station.png'},
  {id:fixtureId(0xc03),variantId:fixtureId(3331),revision:1,name:'街角 · 缩略图待补',path:'背景 / 第二章 / 街角',type:'图像',thumbnail:'/candidate-missing-thumbnail.png'},
  {id:fixtureId(0xc04),variantId:fixtureId(3332),revision:1,name:'雨站 · 缺少精确版本',path:'背景 / 归档',type:'图像',thumbnail:null,unavailable:'缺少该精确版本，保留引用且不可选择'},
];
type Values = { object: string; offset: number; duration: number; tint: string; panel: string };
const initial: Values = {object:objectKey(comparisonObjects[0]!),offset:24,duration:0.8,tint:'#b5c9e7',panel:'#24364bb3'};
type Kind = 'baseline'|'candidate';
type Mode = 'ready'|'loading'|'error'|'disabled'|'empty'|'many';
const modes = [{value:'ready',label:'正常 · 5 项'},{value:'many',label:'长列表 · 24 项'},{value:'empty',label:'空库'},{value:'loading',label:'加载中'},{value:'error',label:'读取失败'},{value:'disabled',label:'只读字段'}];
const manyObjects = [...comparisonObjects, ...Array.from({length:19},(_,index):ProjectObject=>({id:fixtureId(0xc10+index),variantId:fixtureId(0xd10+index),revision:1,name:`站台备选 ${index+1}`,path:`背景 / 备选 / ${index+1}`,type:'图像',thumbnail:'/practice/backgrounds/spring-station.png'}))];

function VersionSwitch({label,value,change}:{label:string;value:Kind;change(value:Kind):void}) {
  return <div className="candidate-version" role="group" aria-label={`${label}方案`}>
    <span>{label}</span>{(['baseline','candidate'] as const).map(kind=><Button key={kind} tone="quiet" aria-pressed={value===kind} onClick={()=>change(kind)}>{kind==='baseline'?'现有':'候选'}</Button>)}
  </div>;
}

export function PropertyComparison({initialTheme='light', initialKind='candidate', initialMode='ready'}:{initialTheme?:'light'|'dark';initialKind?:Kind;initialMode?:Mode}) {
  const [theme,setTheme]=useState(initialTheme), [mode,setMode]=useState<Mode>(initialMode), [alpha,setAlpha]=useState(false);
  const [kinds,setKinds]=useState({color:initialKind,number:initialKind,object:initialKind});
  const [values,setValues]=useState(initial), [preview,setPreview]=useState(initial), [history,setHistory]=useState<{before:Values;label:string}[]>([]);
  const [event,setEvent]=useState('开始体验：先选择一个背景素材。'), [session,setSession]=useState(false), [epoch,setEpoch]=useState(0);
  const live=useRef(initial), [ready,setReady]=useState(false);
  useEffect(()=>{setReady(true);},[]);
  const commit=<K extends keyof Values>(key:K,value:Values[K])=>{
    if(live.current[key]===value) {setPreview(current=>({...current,[key]:value}));return;}
    const before=live.current;live.current={...before,[key]:value};setValues(live.current);setPreview(current=>({...current,[key]:value}));
    const labels:Record<keyof Values,string>={object:'背景素材',offset:'横向偏移',duration:'转场时长',tint:'背景叠色',panel:'对话框底色'};
    setHistory(items=>[...items,{before,label:labels[key]}]);setEvent(`已确认${labels[key]}，可撤销一次。`);
  };
  const previewValue=<K extends keyof Values>(key:K,value:Values[K])=>setPreview(current=>({...current,[key]:value}));
  const reset=()=>{live.current=initial;setValues(initial);setPreview(initial);setHistory([]);setEpoch(value=>value+1);setSession(false);setEvent('已恢复相同起点。');};
  const undo=()=>{const item=history.at(-1);if(!item)return;live.current=item.before;setValues(item.before);setPreview(item.before);setHistory(items=>items.slice(0,-1));setEpoch(value=>value+1);setEvent(`已撤销${item.label}。`);};
  const items=mode==='many'?manyObjects:mode==='empty'?[]:comparisonObjects;
  const selected=comparisonObjects.concat(manyObjects).find(item=>objectKey(item)===preview.object)!;
  const colorKey=alpha?'panel':'tint', color=preview[colorKey], parsed=parseColorString(color)!;
  const disabled=mode==='disabled';
  const switchKind=(key:keyof typeof kinds,kind:Kind)=>{setKinds(current=>({...current,[key]:kind}));setPreview(values);setEpoch(value=>value+1);};
  return <div id="app" className="authoring-shell authoring-pilot-scope candidate-lab" data-authoring-pilot="true" data-theme={theme}>
    <div id="studio-portals" data-authoring-pilot="true" data-theme={theme} lang="zh-CN"/>
    <header className="candidate-lab-header"><div><h1>属性编辑 · 第一批比较</h1><p>选择背景 → 精确输入与拖动 → 改色 → 取消或确认 → 撤销</p></div>
      <div className="candidate-lab-actions"><Button aria-label="切换明暗主题" onClick={()=>setTheme(value=>value==='light'?'dark':'light')}>{theme==='light'?<Moon size={16}/>:<Sun size={16}/>}</Button><Button disabled={session} onClick={reset}><RotateCcw size={16}/>重置场景</Button></div>
    </header>
    <div className="candidate-comparison-bar" inert={session || undefined}>
      <VersionSwitch label="对象选择" value={kinds.object} change={value=>switchKind('object',value)}/>
      <VersionSwitch label="数值输入" value={kinds.number} change={value=>switchKind('number',value)}/>
      <VersionSwitch label="颜色" value={kinds.color} change={value=>switchKind('color',value)}/>
    </div>
    <div className="candidate-workspace">
      <main className="candidate-editor">
        <header className="candidate-document"><strong>雨站来信 / 街角</strong><span>当前语句 · 显示背景</span></header>
        <div className="candidate-scene-content">
          <div className="candidate-preview" aria-label="属性效果预览">
            <img src="/practice/backgrounds/spring-station.png" alt="雨后的站台背景" style={{transform:`translateX(${preview.offset}px)`}}/>
            <div className="candidate-tint" style={{background:preview.tint}}/>
            <div className="candidate-dialogue" style={{background:preview.panel}}><strong>林舟</strong><p>雨停了。那封信，还在你手里吗？</p></div>
          </div>
          <p className="candidate-preview-note">属性效果示意 · {selected.name} · 偏移 {preview.offset} px · 转场 {preview.duration} s</p>
          <p className="candidate-hint">此处使用示例画面观察属性变化；实际 Player 与磁盘保存留待正式接入验证。</p>
          <div className="candidate-current-line"><span>01</span><strong>显示背景</strong><span>{selected.name}</span><span>{preview.duration} s</span></div>
          <details className="candidate-guide"><summary>体验任务与候选来源</summary>
            <ol><li>搜索“第二章”，选择同名的“雨站”，核对路径与版本。</li><li>将偏移输入为 36，再用方向键和“拖动调整”。拖动途中按 Esc。</li><li>打开颜色面板，连续拖色相与色板，按 Esc；重新打开，输入 #789abc 并按 Enter。</li><li>切到“对话框底色”，调透明度；试试格式下拉、外点确认和屏幕取色。</li><li>点击撤销，观察一次面板会话是否整体恢复；分别切换三类控件的“现有／候选”。</li></ol>
            <p>颜色：react-colorful / 原生 ColorAlpha ↔ Dice Base Color Picker＋会话适配；数值：本地 9ui NumberField ↔ coss / Base UI Scrub；对象：本地 Choice ↔ coss / Base UI Combobox＋对象行。</p>
            <p>三类候选均已接受。数值焦点框已调整为输入与单位共用完整外框；生产接入清单在第二批体验后形成。</p>
          </details>
          <details className="candidate-guide"><summary>验证状态与字段身份</summary>
            <label>数据状态<Choice label="数据状态" value={mode} options={modes} disabled={session} onChange={value=>setMode(value as Mode)}/></label>
            {mode==='loading'&&<Button onClick={()=>setMode('ready')}>完成读取</Button>}
            <dl><dt>对象 ID</dt><dd data-testid="object-id">{selected.id}</dd><dt>精确版本</dt><dd>{selected.variantId}</dd><dt>路径</dt><dd data-testid="object-path">{selected.path}</dd><dt>已确认颜色</dt><dd data-testid="committed-color">{values[colorKey]}</dd><dt>预览颜色</dt><dd data-testid="preview-color">{preview[colorKey]}</dd><dt>已确认偏移</dt><dd data-testid="committed-offset">{values.offset}</dd></dl>
          </details>
        </div>
      </main>
      <aside className="candidate-inspector" aria-label="当前语句属性">
        <header><h2>显示背景</h2><p>当前语句的画面与转场</p></header>
        {ready&&<div className="candidate-fields" key={epoch}>
          <section><h3>背景素材</h3>
            {kinds.object==='candidate'?<CandidateObjectPicker value={values.object} items={items} disabled={disabled} status={mode==='loading'||mode==='error'?mode:'ready'} retry={()=>setMode('ready')} onChange={value=>commit('object',value)}/>
              :<Choice label="选择背景素材" value={values.object} options={items.map(item=>({value:objectKey(item),label:item.name}))} disabled={disabled||mode==='loading'||mode==='error'} onChange={value=>{const item=items.find(item=>objectKey(item)===value);if(item?.unavailable)setEvent(item.unavailable);else commit('object',value);}}/>}
            <p className="candidate-hint">{selected.path} · 版本 {selected.revision}</p>
            {kinds.object==='baseline'&&<p className="candidate-baseline-note">现有：少于 10 项无搜索，菜单仅显示名称；无逐项禁用 API。</p>}
          </section>
          <section><h3>位置与转场</h3>
            {kinds.number==='candidate'?<>
              <CandidateNumberField label="横向偏移" value={values.offset} min={-640} max={640} step={1} unit="px" disabled={disabled} onPreview={value=>previewValue('offset',value)} onCommit={value=>commit('offset',value)}/>
              <CandidateNumberField label="转场时长" value={values.duration} min={0} max={10} step={0.1} unit="s" buttons disabled={disabled} onPreview={value=>previewValue('duration',value)} onCommit={value=>commit('duration',value)}/>
            </>:<>{(['offset','duration'] as const).map(key=><div className="candidate-baseline-number" key={key}><label>{key==='offset'?'横向偏移':'转场时长'}</label><NumberField inputLabel={key==='offset'?'横向偏移':'转场时长'} decreaseLabel="减少" increaseLabel="增加" value={preview[key]} min={key==='offset'?-640:0} max={key==='offset'?640:10} step={key==='offset'?1:0.1} unit={key==='offset'?'px':'s'} disabled={disabled} onValueChange={value=>{if(value!==null)previewValue(key,value);}} onValueCommitted={value=>{if(value!==null)commit(key,value);}}/></div>)}<p className="candidate-baseline-note">现有：输入、加减和方向键；没有拖动区域及 Esc 还原。</p></>}
          </section>
          <section><h3>颜色</h3><div inert={session || undefined}><Choice label="颜色字段" value={alpha?'alpha':'rgb'} disabled={disabled} options={[{value:'rgb',label:'背景叠色 · RGB'},{value:'alpha',label:'对话框底色 · RGBA'}]} onChange={value=>{setAlpha(value==='alpha');setEpoch(value=>value+1);}}/></div>
            <div className="candidate-color-field" key={colorKey}>
              {kinds.color==='candidate'?<CandidateColorField value={values[colorKey]} allowAlpha={alpha} disabled={disabled} onSession={setSession} onPreview={value=>previewValue(colorKey,value)} onCommit={value=>commit(colorKey,value)}/>
                :<fieldset disabled={disabled}>{alpha?<ColorAlpha label="对话框底色" value={values.panel} onChange={value=>commit('panel',value)}/>:<ColorField value={[parsed.r,parsed.g,parsed.b]} locale="zh-CN" onChange={value=>commit('tint',value?rgbToHex({r:value[0],g:value[1],b:value[2],a:1}):'#ffffff')}/>}</fieldset>}
            </div>
            {kinds.color==='baseline'&&<p className="candidate-baseline-note">现有：RGB 连续变化直接提交；Esc 不还原。RGBA 使用原生色框，预览与提交时点不同。</p>}
          </section>
          {disabled&&<p className="candidate-hint">只读场景：字段保留内容，修改入口已禁用。</p>}
        </div>}
      </aside>
    </div>
    <footer className="candidate-status"><Button disabled={!history.length||session} onClick={undo}><Undo2 size={16}/>撤销</Button><span role="status">{session?'颜色预览中，尚未确认。':event}</span><span data-testid="history-count">{history.length} 次修改</span><span>Storybook 内存历史</span></footer>
  </div>;
}
