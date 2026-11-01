import { CoreCommandSpecs } from '@galcraft/dsl';
import { createId } from '@galcraft/contracts';
import type { Asset, Character, FieldSpec, Json } from '@galcraft/contracts';
import { Button, Choice, Field } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Disclosure } from '../../components/disclosure.js';
import { StudioNumberField } from '../../components/editor-fields/StudioNumberField.js';
import { extendedFieldLabel, enumLabel } from '../field-help.js';
import { EffectField } from '../effect-field.js';
import { neutralCharacter } from './model.js';
import './characters.css';

export function CharacterAppearanceEditor({ character, assets, locale, disabled, change }: { character: Pick<Character,'id'|'name'> & Partial<Character>; assets: Asset[]; locale: string; disabled?: boolean; change(patch: Partial<Character>): void }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const appearance = character.appearance ?? { notes: '', referenceAssets: [] }, groups = character.groups ?? [], effects = character.defaultEffects ?? neutralCharacter(character.id, character.name).defaultEffects;
  const fields = CoreCommandSpecs.find(spec=>spec.key==='changeFigure')!.fields.find(field=>field.path==='effects')!.children!;
  const common = new Set(['x','y','scaleX','scaleY','opacity','z']);
  const update = (path: string[], value: Json) => { const next = structuredClone(effects) as unknown as Record<string, unknown>; let target = next;
    let specs=fields;for (const key of path.slice(0,-1)) {const spec=specs.find(spec=>spec.path===key); if (!target[key]) target[key] = Object.fromEntries((spec?.children??[]).map(child=>[child.path,structuredClone(child.default)])); target = target[key] as Record<string,unknown>;specs=spec?.children??[]; } target[path.at(-1)!] = value;
    change({defaultEffects:next as Character['defaultEffects']}); };
  const controls = (specs: FieldSpec[], prefix: string[] = []): React.ReactNode => specs.filter(spec=>spec.path!=='station').map(spec=>{ const path=[...prefix,spec.path], label=extendedFieldLabel(spec,locale); let current: unknown=effects; for(const key of path) current=(current as Record<string,unknown>|undefined)?.[key];
    if (spec.type==='object') return <Disclosure key={spec.path}><span>{label}</span>{controls(spec.children??[],path)}</Disclosure>;
    if (spec.type==='boolean') return <Field key={spec.path} label={label}><input type="checkbox" disabled={disabled} checked={current===true} onChange={event=>update(path,event.target.checked)}/></Field>;
    if (spec.type==='enum') return <Field key={spec.path} label={label}><Choice label={label} disabled={disabled} value={String(current??spec.default)} options={(spec.enumValues??[]).map(value=>({value,label:enumLabel(spec.path,value,locale)}))} onChange={value=>update(path,value)}/></Field>;
    if (spec.type==='number'||spec.type==='integer') return <StudioNumberField key={path.join('.')} label={label} locale={locale} value={typeof current==='number'?current:Number(spec.default??0)} min={spec.min} max={spec.max} step={['x','y','z'].includes(spec.path)?1:.01} unit={spec.unit==='px'?'px':spec.unit==='deg'?'°':''} disabled={disabled} onPreview={value=>update(path,value)} onCommit={value=>update(path,value)}/>;
    if(spec.path==='rgb')return <EffectField key={path.join('.')} spec={spec} locale={locale} value={current} change={value=>update(path,value??[255,255,255])}/>;
    return null;
  });
  return <><Field label={t('外观说明','Appearance notes','外見の説明')}><Textarea value={appearance.notes} disabled={disabled} rows={3} onChange={event=>change({appearance:{...appearance,notes:event.target.value}})}/></Field>
    <Disclosure><span>{t('人设参考图','Character reference images','設定参考画像')}</span><p>{t('已选择的图片会作为相关制作的默认参考。','Selected images provide the default references for relevant production.','選択画像を関連制作の既定参考として使用します。')}</p>{appearance.referenceAssets.map(id=><div key={id} className="character-asset-row"><span>{assets.find(asset=>asset.id===id)?.name??t('参考图片未载入','Reference image not loaded','参考画像未読込')}</span><Button tone="quiet" disabled={disabled} onClick={()=>change({appearance:{...appearance,referenceAssets:appearance.referenceAssets.filter(value=>value!==id)}})}>{t('解除关联','Unlink','関連解除')}</Button></div>)}<Field label={t('添加参考图','Add reference image','参考画像を追加')}><Choice label="Add reference image" value="" disabled={disabled} options={[{value:'',label:t('选择作品素材','Choose a project asset','作品素材を選択')},...assets.filter(asset=>asset.kind==='image'&&!appearance.referenceAssets.includes(asset.id)).map(asset=>({value:asset.id,label:asset.name}))]} onChange={id=>id&&change({appearance:{...appearance,referenceAssets:[...appearance.referenceAssets,id]}})}/></Field></Disclosure>
    <Disclosure><span>{t('命名素材组','Named figure groups','名前付き素材グループ')}</span>{groups.map((group,i)=><section key={group.id}><Field label={t('素材组名称','Group name','グループ名')}><Input value={group.name} disabled={disabled} onChange={event=>change({groups:groups.map((item,n)=>n===i?{...item,name:event.target.value}:item)})}/></Field>{assets.filter(asset=>asset.kind==='image'||asset.kind==='live2d').map(asset=><label key={asset.id} className="character-check"><input type="checkbox" disabled={disabled} checked={group.assetIds.includes(asset.id)} onChange={event=>change({groups:groups.map((item,n)=>n===i?{...item,assetIds:event.target.checked?[...item.assetIds,asset.id]:item.assetIds.filter(id=>id!==asset.id)}:item)})}/>{asset.name}</label>)}<Button tone="quiet" disabled={disabled} onClick={()=>change({groups:groups.filter(item=>item.id!==group.id)})}>{t('移除素材组','Remove group','グループを削除')}</Button></section>)}<Button disabled={disabled} onClick={()=>change({groups:[...groups,{id:createId([character,groups]),name:t('新素材组','New figure group','新しい素材グループ'),assetIds:[]}]})}>{t('新增素材组','Add group','グループを追加')}</Button></Disclosure>
    <h3>{t('每次出场的默认效果','Default entrance effects','登場時の既定効果')}</h3><p>{t('出场继承这些效果；本次指令填写的值覆盖对应字段。','Entrances inherit these effects. Values in a command override the corresponding fields.','登場時に継承し、命令で指定した値が対応項目を上書きします。')}</p><div className="character-default-effects">{controls(fields.filter(field=>common.has(field.path)))}</div><Disclosure><span>{t('高级视觉效果','Advanced visual effects','高度な視覚効果')}</span>{controls(fields.filter(field=>!common.has(field.path)))}</Disclosure>
  </>;
}
