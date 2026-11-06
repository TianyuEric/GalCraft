import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, CheckCircle2, Clock3, Download, FolderCog, PackageCheck, Plug, Plus, RotateCcw, XCircle } from 'lucide-react';
import { useReview, useReviewState } from './context.js';
import type { Project } from './model.js';

export function SupportView({ kind }: { kind: 'project-settings' | 'connections' | 'backups' | 'build' }) {
  const store = useReview(), { project, ui } = useReviewState();
  const [snapshots, setSnapshots] = useState<{ id: string; name: string; project: Project; time: string }[]>([]);
  const [snapshotName, setSnapshotName] = useState('继续创作前');
  const [selected, setSelected] = useState<string | null>(null);
  const [connection, setConnection] = useState<'idle' | 'checking' | 'ready' | 'failed'>('idle');
  const [build, setBuild] = useState<'idle' | 'running' | 'ready' | 'failed' | 'cancelled'>('idle');
  const [progress, setProgress] = useState(0), [errors, setErrors] = useState<string[]>([]);
  const [report, setReport] = useState<object | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const snapshot = snapshots.find(s => s.id === selected);
  const beginBuild = () => {
    const issues = project.scenes.flatMap(scene => ui.sourceErrors[scene.id] ? [ui.sourceErrors[scene.id]!] : []);
    if (!project.scenes.some(scene => scene.lines.length)) issues.push('作品还没有可检查的文稿。');
    const missing = project.page.edges.filter(edge => !project.page.nodes.some(n => n.id === edge.source) || !project.page.nodes.some(n => n.id === edge.target));
    if (missing.length) issues.push('页面蓝图包含失去目标的连接。');
    setErrors(issues); setReport(null);
    if (issues.length) { setBuild('failed'); return; }
    setBuild('running'); setProgress(0);
    let value = 0;
    const step = () => { value += 25; setProgress(value); if (value < 100) timer.current = setTimeout(step, 280); else { setBuild('ready'); setReport({ kind: 'galcraft-r0-review-report', project: project.name, scenes: project.scenes.map(s => ({ name: s.name, statements: s.lines.length })), assets: project.assets.length, pageObjects: project.page.objects.length, scope: '审核数据检查；未生成可分发游戏包' }); } };
    timer.current = setTimeout(step, 280);
  };
  const heading = { 'project-settings': ['作品设置', FolderCog], connections: ['插件与连接', Plug], backups: ['备份与恢复', ArchiveRestore], build: ['构建与成果', PackageCheck] }[kind];
  const Icon = heading[1] as typeof FolderCog;
  return <section className="gc-r0-support"><div className="gc-r0-view-toolbar"><Icon size={16}/><strong>{heading[0] as string}</strong><span className="gc-r0-spacer"/><small>审核会话</small></div><div className="gc-r0-support-body">
    {kind === 'project-settings' && <><h2>作品信息</h2><label>作品名称<input aria-label="作品名称" value={project.name} onChange={e => store.edit('修改作品名称', p => { p.name = e.target.value; }, 'project-name')}/></label><dl><div><dt>场景</dt><dd>{project.scenes.length} 个</dd></div><div><dt>角色</dt><dd>{project.characters.length} 位</dd></div><div><dt>舞台尺寸</dt><dd>1920 × 1080</dd></div><div><dt>内容位置</dt><dd>本次审核会话</dd></div></dl><p>名称修改会同步到工作台，可通过全局撤销恢复。</p><button className="gc-r0-primary" onClick={() => void store.save()}>保存作品信息</button></>}
    {kind === 'connections' && <><h2>素材制作连接</h2><p>当前连接使用教学作品素材，供制作、取消、失败恢复和采用流程审核。</p><div className="gc-r0-support-card"><Plug size={22}/><div><strong>审核素材服务</strong><p>输出可复现的表情候选</p></div><label className="gc-r0-check"><input type="checkbox" aria-label="启用审核素材服务" checked={ui.productionServiceEnabled !== false} onChange={e => { store.updateUi(u => { u.productionServiceEnabled = e.target.checked; }); setConnection('idle'); }}/>{ui.productionServiceEnabled === false ? '已停用' : '已启用'}</label></div><button disabled={connection === 'checking'} onClick={() => { setConnection('checking'); timer.current = setTimeout(() => setConnection(store.getSnapshot().ui.productionServiceEnabled === false ? 'failed' : 'ready'), 350); }}>{connection === 'checking' ? '检查中…' : '检查连接'}</button>{connection === 'ready' && <p className="gc-r0-support-success" role="status"><CheckCircle2 size={16}/>审核服务可用</p>}{connection === 'failed' && <p className="gc-r0-support-error" role="alert"><XCircle size={16}/>连接已停用，启用后可继续制作。</p>}<h3>服务范围</h3><p>真实 AI 账户、密钥、费用和外部插件将在正式宿主阶段接通。此处无需填写凭据。</p></>}
    {kind === 'backups' && <><h2>会话快照</h2><p>快照保留作品内容，恢复可撤销。刷新此 Story 会结束当前内存会话。</p><form className="gc-r0-support-inline" onSubmit={e => { e.preventDefault(); if (!snapshotName.trim()) return; const id = crypto.randomUUID(); setSnapshots(old => [{ id, name: snapshotName.trim(), project: structuredClone(project), time: new Date().toLocaleTimeString('zh-CN') }, ...old]); setSelected(id); store.notice('已创建会话快照'); }}><input aria-label="快照名称" value={snapshotName} onChange={e => setSnapshotName(e.target.value)} maxLength={80}/><button className="gc-r0-primary" disabled={!snapshotName.trim()}><Plus size={14}/>创建快照</button></form><div className="gc-r0-support-list">{snapshots.map(item => <button key={item.id} className={selected === item.id ? 'is-selected' : ''} onClick={() => setSelected(item.id)}><Clock3 size={14}/><span>{item.name}</span><small>{item.time}</small></button>)}{!snapshots.length && <p>尚未创建快照。</p>}</div>{snapshot && <div className="gc-r0-support-card"><div><strong>{snapshot.name}</strong><p>{snapshot.project.scenes.length} 个场景 · {snapshot.project.scenes.reduce((n, s) => n + s.lines.length, 0)} 句 · {snapshot.project.assets.length} 项素材</p></div><button onClick={() => { store.edit('恢复会话快照', p => Object.assign(p, structuredClone(snapshot.project))); store.notice(`已恢复「${snapshot.name}」，可撤销`); }}><ArchiveRestore size={15}/>恢复这份快照</button></div>}</>}
    {kind === 'build' && <><h2>检查作品并准备成果</h2><p>审核构建检查当前文稿、素材统计和蓝图引用，生成可下载的检查报告。正式打包与发行沿后续批次接入。</p><button className="gc-r0-primary" disabled={build === 'running'} onClick={beginBuild}><PackageCheck size={15}/>{build === 'failed' ? '重新检查' : '开始审核构建'}</button>{build === 'running' && <div className="gc-r0-support-progress"><progress max={100} value={progress}/><span>{progress}% · 检查与装配审核报告</span><button onClick={() => { if (timer.current) clearTimeout(timer.current); setBuild('cancelled'); }}>取消</button></div>}{build === 'cancelled' && <p role="status">已取消，作品内容保留。</p>}{build === 'failed' && <div role="alert" className="gc-r0-support-error"><XCircle size={17}/><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}{build === 'ready' && report && <div className="gc-r0-support-card"><CheckCircle2 size={25}/><div><strong>审核报告已就绪</strong><p>作品：{project.name}</p></div><button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'galcraft-r0-review-report.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download size={15}/>下载报告</button></div>}</>}
  </div></section>;
}
