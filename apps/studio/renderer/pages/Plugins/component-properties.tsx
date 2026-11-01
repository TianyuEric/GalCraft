import { useState } from 'react';
import type { Json, Result } from '@galcraft/contracts';
import type { ComponentContribution } from '@galcraft/plugins/contracts';
import { validatePluginData } from '@galcraft/plugins/contracts';
import { PluginFields, fieldRecord, pluginInputsValid, type PluginReference } from './plugin-fields.js';
import { Button } from '../../components/controls.js';

export function PluginComponentProperties({ definition, initial, locale, references, apply }: { definition: ComponentContribution; initial: Json; locale: string; references: PluginReference[]; apply(value: Json): Promise<Result<void>> }) {
  const [value, setValue] = useState(fieldRecord(structuredClone(initial))), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return <div className="plugin-component-properties"><h3>{t('插件公开属性', 'Plugin properties', 'プラグインのプロパティ')}</h3>
    <PluginFields fields={definition.fields ?? []} value={value} change={setValue} locale={locale} references={references}/>
    {error && <p className="workbench-error" role="alert">{error}</p>}
    <Button tone="primary" disabled={busy || JSON.stringify(value) === JSON.stringify(initial)} onClick={() => void (async () => {
      if (!pluginInputsValid()) return;
      setBusy(true); setError(''); try { if (definition.propsSchema) { const validation = validatePluginData(definition.propsSchema, value); if (!validation.ok) throw new Error(validation.error.message); }
        const result = await apply(value); if (!result.ok) throw new Error(result.error.message);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    })()}>{t('应用属性', 'Apply properties', 'プロパティを適用')}</Button>
    {definition.publicParts.length > 0 && <details><summary>{t('公开部件', 'Public parts', '公開パーツ')}</summary>{definition.publicParts.join(' · ')}</details>}
  </div>;
}
