import { useEffect, useRef, useState } from 'react';
import type { CollaborationBridge, HarnessConfiguration } from '@galcraft/collaboration/contracts';
import type { Result } from '@galcraft/contracts';
import { Button, Choice, Field } from '../../components/controls.js';
import { CodeBlock } from '../../components/code-block.js';

type Feedback = {phase:'busy'|'success'|'error'|'neutral';message:string};
type Props = {bridge:CollaborationBridge;locale:string;endpoint:string|null;projectId?:string|null;harness:HarnessConfiguration['harness'];destination:'personal'|'project';purpose:'mcp'|'skill';onHarness(value:Props['harness']):void;onDestination(value:Props['destination']):void;onPurpose(value:Props['purpose']):void};
const unwrap=<T,>(result:Result<T>):T=>{if(!result.ok)throw new Error(result.error.message);return result.value;};
const reason=(error:unknown)=>error instanceof Error?error.message:String(error);

/** Configuration facts come from the host; action feedback belongs to this operation. */
export function HarnessConfigurationPanel({bridge,locale,endpoint,projectId,harness,destination,purpose,onHarness,onDestination,onPurpose}:Props){
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const [configuration,setConfiguration]=useState<HarnessConfiguration|null>(null),[reading,setReading]=useState(false),[readError,setReadError]=useState(''),[feedback,setFeedback]=useState<Feedback|null>(null),[feedbackAction,setFeedbackAction]=useState('');
  const [workspaces,setWorkspaces]=useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem('galcraft.collaboration.codexWorkspaces')??'{}');}catch{return {};}}),[choosing,setChoosing]=useState(false);
  const request=useRef(0);
  const codexMcp=harness==='codex'&&purpose==='mcp';
  const workspaceDirectory=codexMcp&&projectId?workspaces[projectId]:undefined;
  const setWorkspace=(directory:string|null)=>{if(!projectId)return;const next={...workspaces};if(directory)next[projectId]=directory;else delete next[projectId];localStorage.setItem('galcraft.collaboration.codexWorkspaces',JSON.stringify(next));setWorkspaces(next);};
  const available=(purpose==='skill'||!!endpoint)&&(harness==='dsh'&&purpose==='mcp'&&destination==='personal'||!!projectId);
  const input={harness,purpose,destination:harness==='dsh'&&purpose==='mcp'?destination:'project' as const,...(workspaceDirectory?{workspaceDirectory}:{})};
  const read=async()=>unwrap(await bridge.configuration(input));
  useEffect(()=>{
    const id=++request.current;setConfiguration(null);setReadError('');setFeedback(null);setReading(available);
    if(available)void bridge.configuration(input).then(result=>{if(id===request.current)setConfiguration(unwrap(result));}).catch(error=>{if(id===request.current)setReadError(reason(error));}).finally(()=>{if(id===request.current)setReading(false);});
    return()=>{request.current++;};
  },[bridge,harness,purpose,destination,endpoint,projectId,available,workspaceDirectory]);
  const busy=reading||choosing||feedback?.phase==='busy';
  const chooseWorkspace=async()=>{
    setChoosing(true);setReadError('');
    try{const directory=unwrap(await bridge.chooseWorkspaceDirectory({directory:configuration?.workspaceDirectory??workspaceDirectory}));if(directory)setWorkspace(directory);}
    catch(error){setReadError(reason(error));}finally{setChoosing(false);}
  };
  const preview=async()=>{setReading(true);setReadError('');setFeedback(null);try{setConfiguration(await read());}catch(error){setConfiguration(null);setReadError(reason(error));}finally{setReading(false);}};
  const action=async(mode:'merge'|'export'|'copy'|'command')=>{
    if(!configuration||busy)return;
    setFeedbackAction(mode);
    setFeedback({phase:'busy',message:mode==='merge'?(purpose==='skill'?t('正在安装项目 skill…','Installing project skill…','作品の skill を導入中…'):t('正在安装 / 更新 MCP 配置…','Installing / updating MCP configuration…','MCP 設定を導入・更新中…')):mode==='export'?t('正在选择导出位置并写入文件…','Selecting a destination and exporting…','書き出し先を選んで保存中…'):t('正在复制…','Copying…','コピー中…')});
    try{
      if(mode==='copy'||mode==='command'){await navigator.clipboard.writeText(mode==='copy'?configuration.content:configuration.command);setFeedback({phase:'success',message:mode==='copy'?t('配置已复制','Configuration copied','設定をコピーしました'):t('启动命令已复制','Launch command copied','起動コマンドをコピーしました')});return;}
      const result=unwrap(await bridge.writeConfiguration({...configuration,mode}));
      if(result.status==='cancelled'){setFeedback({phase:'neutral',message:t('已取消导出，文件保持原样。','Export cancelled. Files are unchanged.','書き出しをキャンセルしました。ファイルは変更していません。')});return;}
      if(mode==='export'){setFeedback({phase:'success',message:t('配置已导出到：','Configuration exported to: ','設定の書き出し先：')+result.path});return;}
      const written=t('已写入：','Written to: ','保存先：')+result.path;
      try{
        const next=await read();setConfiguration(next);setReadError('');
        const preserved=next.readback.files.some(file=>file.update);
        setFeedback({phase:'success',message:preserved?t('本地编辑已保留，官方更新已另存为 .galcraft-update，等待审阅。','Local edits are preserved. Official updates are saved as .galcraft-update for review.','ローカルの編集を保持し、公式更新を .galcraft-update に保存しました。内容を確認してください。')+' '+written:(purpose==='skill'?t('项目 skill 已安装。','Project skill installed.','作品の skill を導入しました。'):t('MCP 配置已写入。请在助手中重新加载 MCP 并确认 GalCraft 已连接。','MCP configuration written. Reload MCP in your assistant and confirm GalCraft is connected.','MCP 設定を保存しました。アシスタントで MCP を再読み込みし、GalCraft の接続を確認してください。'))+' '+written});
      }catch(error){setConfiguration(null);setReadError(reason(error));setFeedback({phase:'success',message:written+' '+t('写入成功；重新读取配置后确认最新状态。','Write succeeded. Read the configuration again to confirm its latest state.','保存しました。設定を再読み込みして最新状態を確認してください。')});}
    }catch(error){setFeedback({phase:'error',message:reason(error)});}
  };
  const state=configuration?.readback.state;
  const stateLabel=state==='notInstalled'?t('未安装','Not installed','未導入'):state==='current'?(purpose==='skill'?t('已安装 · 与当前版本一致','Installed · Up to date','導入済み・最新版'):t('配置已写入','Configuration written','設定は保存済み')):state==='localEdits'?t('保留本地编辑','Local edits preserved','ローカルの編集を保持'):t('可更新','Update available','更新できます');
  const canWrite=!!configuration?.changes?.length;
  return <section className="collaboration-config-panel"><h2>{t('Harness 配置','Harness configuration','Harness 設定')}</h2>
    <div className="collaboration-config-fields">
      <Field label={t('安装内容','Install','導入する内容')}><Choice disabled={busy} label={t('安装内容','Install','導入する内容')} value={purpose} options={[{value:'mcp',label:t('MCP 连接','MCP connection','MCP 接続')},{value:'skill',label:t('项目创作 skill','Project creation skill','作品の制作 skill')}]} onChange={value=>onPurpose(value as Props['purpose'])}/></Field>
      <Field label="Harness"><Choice disabled={busy} label="Harness" value={harness} options={[{value:'dsh',label:'DSH'},{value:'claude',label:'Claude Code'},{value:'codex',label:'Codex'}]} onChange={value=>onHarness(value as Props['harness'])}/></Field>
      <Field label={t('配置位置','Configuration location','設定先')}><Choice disabled={busy} label={t('配置位置','Configuration location','設定先')} value={harness==='dsh'&&purpose==='mcp'?destination:'project'} options={harness==='dsh'&&purpose==='mcp'?[{value:'personal',label:t('个人 profile','Personal profile','個人プロファイル')},{value:'project',label:t('作品 patch','Project patch','作品パッチ')}]:[{value:'project',label:t('项目配置','Project configuration','プロジェクト設定')}]} onChange={value=>onDestination(value as Props['destination'])}/></Field>
    </div>
    {codexMcp&&<div className="collaboration-workspace-directory">
      <Field label={t('助手工作区目录','Assistant workspace directory','アシスタントの作業ディレクトリ')}><p className="collaboration-config-path">{workspaceDirectory??configuration?.workspaceDirectory??t('默认使用当前作品目录','Defaults to the current project directory','既定は現在の作品ディレクトリ')}</p><div className="gc-actions"><Button disabled={busy||!projectId} onClick={()=>void chooseWorkspace()}>{choosing?t('正在选择目录…','Choosing a directory…','ディレクトリを選択中…'):t('选择工作区目录','Choose workspace directory','作業ディレクトリを選択')}</Button>{workspaceDirectory&&<Button disabled={busy} onClick={()=>setWorkspace(null)}>{t('使用当前作品目录','Use current project directory','現在の作品ディレクトリを使用')}</Button>}</div></Field>
      <p className="collaboration-meta">{t('选择 Codex 实际打开的工作目录。多个作品可共用上级工作区的 MCP 连接；当前作品接入信息保持独立。','Choose the working directory opened in Codex. Projects can share an MCP connection in a parent workspace; project connection details stay separate.','Codex で開く作業ディレクトリを選択してください。親の作業ディレクトリで複数の作品が MCP 接続を共有でき、作品ごとの接続情報は個別に扱います。')}</p>
    </div>}
    <div className="gc-actions collaboration-preview-actions"><Button disabled={busy||!available} onClick={()=>void preview()}>{reading?t('正在读取配置…','Reading configuration…','設定を読み込み中…'):t('生成配置预览','Preview configuration','設定をプレビュー')}</Button>{configuration&&<span className="collaboration-config-state" data-state={state}>{stateLabel}</span>}</div>
    {!available&&<p>{purpose==='mcp'&&!endpoint?t('先在本机服务页开启服务。','Start the service first.','先にサービスを開始してください。'):t('先打开作品，再读取项目配置。','Open a project to read its configuration.','作品を開いて設定を読み込んでください。')}</p>}
    {readError&&<p className="collaboration-feedback" role="alert">{readError}</p>}
    {configuration&&<div className="collaboration-configuration">
      <p className="collaboration-config-path">{t('配置文件：','Configuration file: ','設定ファイル：')}{configuration.path}</p>
      <div className="collaboration-config-operation" aria-busy={busy}>
        <div className="gc-actions"><Button tone="primary" disabled={busy||!canWrite} onClick={()=>void action('merge')}>{purpose==='skill'?(state==='notInstalled'?t('安装项目 skill','Install project skill','作品の skill を導入'):state==='localEdits'?t('保存官方更新供审阅','Save official updates for review','公式更新を確認用に保存'):canWrite?t('更新项目 skill','Update project skill','作品の skill を更新'):t('项目 skill 已安装','Project skill installed','作品の skill は導入済み')):canWrite?t('安装 / 更新 MCP 配置','Install / update MCP configuration','MCP 設定を導入・更新'):t('MCP 配置已写入','MCP configuration written','MCP 設定は保存済み')}</Button>{purpose==='mcp'&&<Button disabled={busy} onClick={()=>void action('export')}>{t('导出文件','Export file','ファイルを書き出す')}</Button>}<Button disabled={busy} onClick={()=>void action('copy')}>{t('复制配置','Copy configuration','設定をコピー')}</Button></div>
        {purpose==='mcp'&&<p className="collaboration-meta">{t('此处显示配置文件状态。助手连接状态请在客户端重新加载 MCP 后确认。','This shows the configuration file status. Reload MCP in the client to confirm the assistant connection.','ここでは設定ファイルの状態を表示します。アシスタントの接続状態は、クライアントで MCP を再読み込みして確認してください。')}</p>}
        {feedback&&feedbackAction!=='command'&&<p className="collaboration-operation-feedback" data-phase={feedback.phase} role={feedback.phase==='error'?'alert':'status'}>{feedback.message}</p>}
        {!canWrite&&<p className="collaboration-meta">{state==='localEdits'?t('更新文件已就绪，审阅并自行应用需要的内容。','Update files are ready. Review them and apply the content you need.','更新ファイルを確認し、必要な内容を適用してください。'):t('实际目标文件已与当前配置一致。','The target files match the current configuration.','保存先のファイルは現在の設定と一致しています。')}</p>}
      </div>
      {configuration.readback.files.filter(file=>file.update).map(file=><details className="collaboration-file-diff collaboration-preserved-file" key={file.path}><summary>{t('本地编辑已保留 · ','Local edits preserved · ','ローカルの編集を保持・')}{file.path}<span className="collaboration-meta">{file.update!.pending?t('更新待审阅：','Update awaiting review: ','確認待ちの更新：'):t('官方更新将另存到：','Official updates will be saved to: ','公式更新の保存予定先：')}{file.update!.path}</span></summary><div className="collaboration-diff-columns"><section><h3 className="collaboration-diff-title">{t('保留的本地内容','Preserved local content','保持するローカルの内容')}</h3><CodeBlock code={file.update!.localContent} locale={locale} copyOnly/></section><section><h3 className="collaboration-diff-title">{t('官方更新','Official update','公式更新')}</h3><CodeBlock code={file.update!.content} locale={locale} copyOnly/></section></div></details>)}
      {state==='current'&&<details className="collaboration-file-diff"><summary>{t('查看当前文件内容','View current file content','現在のファイル内容を表示')}</summary><CodeBlock code={configuration.existing??configuration.content} locale={locale} copyOnly/></details>}
      {!!configuration.changes?.length&&<p className="collaboration-meta">{t('审阅本次实际文件变更；其他配置和本地编辑继续保留。','Review the actual file changes. Other settings and local edits are preserved.','実際のファイル変更を確認してください。他の設定とローカルの編集は保持します。')}</p>}
      {configuration.changes?.map(file=><details className="collaboration-file-diff" key={file.path}><summary>{file.path}</summary><div className="collaboration-diff-columns"><section><h3 className="collaboration-diff-title">{t('保存前','Before','変更前')}</h3><CodeBlock code={file.existing??t('新文件','New file','新規ファイル')} locale={locale} copyOnly/></section><section><h3 className="collaboration-diff-title">{t('保存后','After','変更後')}</h3><CodeBlock code={file.content} language={file.path.endsWith('.md')?'markdown':file.path.endsWith('.toml')?'toml':file.path.endsWith('.yml')||file.path.endsWith('.yaml')?'yaml':'json'} locale={locale} copyOnly/></section></div></details>)}
      <h3>{configuration.project?t('作品接入','Project connection','作品への接続'):t('全局创建接入','Global creation connection','作品作成への接続')}</h3>
      {codexMcp&&configuration.project&&<p className="collaboration-config-path">{t('当前接入作品目录：','Connected project directory: ','接続する作品ディレクトリ：')}{configuration.project.projectRoot}</p>}
      {configuration.instructions&&<CodeBlock code={configuration.instructions} language="text" locale={locale} copyOnly/>}
      <p>{t('PowerShell 启动命令','PowerShell launch command','PowerShell 起動コマンド')}</p><CodeBlock code={configuration.command} language="powershell" locale={locale} copyOnly/>
      <Button disabled={busy} onClick={()=>void action('command')}>{t('复制启动命令','Copy launch command','起動コマンドをコピー')}</Button>
      {feedback&&feedbackAction==='command'&&<p className="collaboration-operation-feedback" data-phase={feedback.phase} role={feedback.phase==='error'?'alert':'status'}>{feedback.message}</p>}
      {configuration.guidance?.filter(line=>!line.startsWith('Kept your edited file:')).map(line=><p className="collaboration-meta" key={line}>{line}</p>)}
    </div>}
    {!configuration&&feedback&&<p className="collaboration-operation-feedback" data-phase={feedback.phase} role={feedback.phase==='error'?'alert':'status'}>{feedback.message}</p>}
  </section>;
}
