import type { WorkflowBinding, WorkflowUsageGuidance as UsageGuidance } from '@galcraft/contracts';
import { Button, Field } from '../../components/controls.js';
import { Disclosure } from '../../components/disclosure.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';

export function WorkflowUsageGuidance({ binding, locale, change, portLabel }: {
  binding: Pick<WorkflowBinding, 'inputs' | 'usageGuidance'>; locale: string;
  change(value: UsageGuidance): void; portLabel(port: string): string;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const guidance = binding.usageGuidance ?? { description: '', scenarios: [], inputs: [], promptTips: [], limitations: [], examples: [] };
  const update = (patch: Partial<UsageGuidance>) => change({ ...guidance, ...patch });
  const ports = [...new Set([...binding.inputs.map(input => input.port), ...guidance.inputs.map(input => input.port)])];
  const lines = (key: 'scenarios' | 'promptTips' | 'limitations', label: string) => <Field label={label} help={t('每行一项。', 'One item per line.', '1 行に 1 項目。')}>
    <Textarea rows={3} value={guidance[key].join('\n')} onChange={event => update({ [key]: event.target.value ? event.target.value.split('\n') : [] })}/>
  </Field>;
  return <section className="workflow-section workflow-guidance" aria-label={t('工作流使用指导', 'Workflow usage guidance', 'ワークフローの利用ガイド')}>
    <Field label={t('用途说明', 'Purpose description', '用途の説明')} help={t('说明这张图适合生成什么；制作目录会显示这段说明。', 'Describe what this graph is suited to produce. This description appears in the production catalog.', 'このグラフで作る内容を説明します。制作カタログにも表示されます。')}>
      <Textarea rows={2} value={guidance.description} onChange={event => update({ description: event.target.value })}/>
    </Field>
    <Disclosure><span>{t('使用指导与示例', 'Usage guidance & examples', '利用ガイドと例')}</span>
      <div className="workflow-guidance-details">
        {lines('scenarios', t('适用场景', 'Suitable scenarios', '適する場面'))}
        <section className="workflow-section"><h3>{t('输入说明', 'Input explanations', '入力の説明')}</h3>
          {ports.length ? ports.map(port => <Field key={port} label={`${portLabel(port)} · ${port}`}><Textarea rows={2} value={guidance.inputs.find(input => input.port === port)?.description ?? ''}
            onChange={event => update({ inputs: [...guidance.inputs.filter(input => input.port !== port), { port, description: event.target.value }] })}/></Field>)
            : <p className="field-help">{t('绑定制作字段后，在这里补充每个输入的用法。', 'Map production fields below, then describe how to use each input here.', '制作フィールドを設定してから、ここで各入力の使い方を説明します。')}</p>}
        </section>
        {lines('promptTips', t('提示词建议', 'Prompt tips', 'プロンプトのヒント'))}
        {lines('limitations', t('使用限制', 'Limitations', '利用上の制限'))}
        <section className="workflow-section"><h3>{t('使用示例', 'Examples', '使用例')}</h3>
          {!guidance.examples.length && <p className="field-help">{t('添加一个实际输入示例，帮助选择工作流和准备提示词。', 'Add a real input example to help select the workflow and prepare prompts.', '実際の入力例を追加すると、選択とプロンプト作成に役立ちます。')}</p>}
          {guidance.examples.map((example, index) => <div className="workflow-guidance-example" key={index}>
            <Field label={`${t('示例名称', 'Example title', '例の名前')} ${index + 1}`}><Input value={example.title} onChange={event => update({ examples: guidance.examples.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })}/></Field>
            <Field label={`${t('示例输入', 'Example input', '入力例')} ${index + 1}`}><Textarea rows={3} value={example.input} onChange={event => update({ examples: guidance.examples.map((item, i) => i === index ? { ...item, input: event.target.value } : item) })}/></Field>
            <Field label={`${t('示例说明', 'Example notes', '例の説明')} ${index + 1}`}><Textarea rows={2} value={example.notes} onChange={event => update({ examples: guidance.examples.map((item, i) => i === index ? { ...item, notes: event.target.value } : item) })}/></Field>
            <Button tone="quiet" onClick={() => update({ examples: guidance.examples.filter((_, i) => i !== index) })}>{t('移除此示例', 'Remove this example', 'この例を削除')}</Button>
          </div>)}
          <div className="gc-actions"><Button onClick={() => update({ examples: [...guidance.examples, { title: '', input: '', notes: '' }] })}>{t('添加示例', 'Add example', '例を追加')}</Button></div>
        </section>
      </div>
    </Disclosure>
  </section>;
}
