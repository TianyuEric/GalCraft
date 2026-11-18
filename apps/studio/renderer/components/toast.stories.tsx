import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Field } from './controls.js';
import { Textarea } from './ui/textarea.js';
import { StudioToaster, studioToasts } from './toast.js';

type Locale = 'zh-CN' | 'en' | 'ja';

function MessageExample({ theme = 'light', locale = 'zh-CN' }: { theme?: 'light' | 'dark'; locale?: Locale }) {
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [batchCount, setBatchCount] = useState(0);
  const [recovery, setRecovery] = useState<'idle' | 'open' | 'done'>('idle');
  const recoveryTarget = useRef<HTMLDivElement>(null);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  useEffect(() => {
    studioToasts.close();
    setReady(true);
    return () => studioToasts.close();
  }, []);
  const show = (type: 'success' | 'error' | 'warning' | 'info') => {
    const titles = {
      success: t('示例人物资料已应用', 'Fixture character changes applied', 'サンプル人物の変更を適用しました'),
      error: t('示例保存失败，输入已保留', 'Fixture save failed; your input is preserved', 'サンプルの保存に失敗しました。入力は保持されています'),
      warning: t('示例中有 2 项素材需要检查', 'Two fixture assets need checking', '確認が必要なサンプル素材が 2 件あります'),
      info: t('示例预览已更新', 'Fixture preview updated', 'サンプルのプレビューを更新しました'),
    };
    studioToasts.add({ type, title: titles[type] });
  };
  const batchId = 'message-fixture-import-batch';
  const openRecovery = () => {
    setRecovery('open');
    recoveryTarget.current?.focus({ preventScroll: true });
  };
  const replaceBatch = () => {
    const count = batchCount + 1;
    setBatchCount(count);
    setRecovery('idle');
    studioToasts.add({ id: batchId, type: 'warning',
      title: t(`本批 ${count} 项示例素材未导入`, `${count} fixture assets in this batch were not imported`, `このバッチのサンプル素材 ${count} 件を読み込めませんでした`),
      description: t('再次触发会更新同一条消息。恢复动作打开下方的本地夹具结果。', 'Trigger again to replace this message. The recovery action opens the local fixture result below.', 'もう一度押すと同じ通知が更新されます。復旧操作で下のローカルサンプル結果を開きます。'),
      actionProps: { children: t('查看本批示例', 'View fixture batch', 'サンプルバッチを表示'), onClick: openRecovery },
    });
  };
  const longText = t(
    '本批仍有 3 项素材未导入。文件“雨夜车站的环境音与人物参考图”没有匹配的类型。已成功的素材继续保留，请返回本批结果检查类型与失败原因，再选择需要重试的项目。正文完整显示，支持鼠标选择与复制；关闭通知不会清理所属批次结果。',
    'Three assets in this fixture batch were not imported. The file “Rainy station ambience and character references” has no matching asset type. Successful assets remain available. Return to the batch result to inspect the type and reason, then select the items to retry. This full message supports text selection and copying; dismissing it keeps the batch result.',
    'このサンプルバッチでは 3 件の素材を読み込めませんでした。「雨の駅の環境音と人物参考画像」に対応する素材タイプがありません。読み込み済みの素材は保持されています。バッチ結果でタイプと理由を確認し、再試行する項目を選択してください。本文は選択してコピーできます。通知を閉じてもバッチ結果は残ります。',
  );
  return <div id="app" className="authoring-shell" data-theme={theme} lang={locale} style={{ boxSizing: 'border-box', minHeight: '100dvh', background: 'var(--background)', color: 'var(--foreground)', padding: 24 }}>
    <div id="studio-portals" data-theme={theme} lang={locale}/>
    {ready && <StudioToaster locale={locale}/>}
    <main style={{ maxWidth: 720, margin: '0 auto', paddingTop: 160, fontFamily: 'var(--font-sans)' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 18, lineHeight: '28px', fontWeight: 600 }}>{t('Message', 'Message', 'Message')}</h1>
      <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: '20px', color: 'var(--foreground-secondary)' }}>
        {t('组件夹具：所有结果均为本地示例，不访问磁盘或服务。消息最多显示 3 条。', 'Component fixture: all results are local examples, with no disk or service access. Up to three messages are visible.', 'コンポーネントサンプルです。結果はすべてローカルの例で、ディスクやサービスには接続しません。通知は最大 3 件表示されます。')}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <Button onClick={() => show('success')}>{t('成功', 'Success', '成功')}</Button>
        <Button onClick={() => show('error')}>{t('错误', 'Error', 'エラー')}</Button>
        <Button onClick={() => show('warning')}>{t('警告', 'Warning', '警告')}</Button>
        <Button onClick={() => show('info')}>{t('信息', 'Info', '情報')}</Button>
      </div>
      <Field label={t('继续编辑', 'Keep editing', '編集を続ける')} help={t('输入后按 Ctrl+Enter 触发成功消息，焦点和选区保留在输入框。F6 进入通知，Shift+Tab 返回。', 'Type, then press Ctrl+Enter to trigger success while keeping focus and selection here. F6 enters notifications; Shift+Tab returns.', '入力後に Ctrl+Enter を押すと、フォーカスと選択範囲を保ったまま成功通知が表示されます。F6 で通知へ移動し、Shift+Tab で戻ります。')}>
        <Textarea value={draft} onChange={event => setDraft(event.target.value)} rows={3} onKeyDown={event => {
          if (event.ctrlKey && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); show('success'); }
        }}/>
      </Field>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Button onClick={() => studioToasts.add({ type: 'info', title: t('2 秒计时示例', 'Two-second timed example', '2 秒のタイマー例'), description: t('悬停或按 F6 聚焦通知，停留超过 2 秒后移开；剩余时间继续计时。', 'Hover or press F6 to focus this notification. Stay for over two seconds, then leave to resume the remaining time.', '通知にカーソルを合わせるか F6 でフォーカスしてください。2 秒以上待ってから離れると、残り時間の計測が再開します。'), timeout: 2000 })}>{t('测试暂停计时', 'Test timer pause', 'タイマー停止を試す')}</Button>
        <Button onClick={() => studioToasts.add({ type: 'error', title: t('长文本示例', 'Long text example', '長文の例'), description: longText })}>{t('长文本与复制', 'Long text and copying', '長文とコピー')}</Button>
        <Button onClick={replaceBatch}>{t('更新同一批消息', 'Replace the same batch message', '同じバッチ通知を更新')}</Button>
        <Button tone="quiet" onClick={() => studioToasts.close()}>{t('关闭全部通知', 'Dismiss all messages', 'すべての通知を閉じる')}</Button>
      </div>
      <p style={{ margin: '0 0 24px', fontSize: 12, lineHeight: '16px', color: 'var(--foreground-secondary)' }}>{t('普通消息 4.5 秒后消失；错误和含操作的消息持续保留，直到关闭或由来源更新。', 'Ordinary messages dismiss after 4.5 seconds. Errors and messages with actions remain until dismissed or updated by their source.', '通常の通知は 4.5 秒後に閉じます。エラーや操作付きの通知は、閉じるか発生元が更新するまで残ります。')}</p>
      <div ref={recoveryTarget} tabIndex={-1} aria-label={t('本批示例结果', 'Fixture batch result', 'サンプルバッチ結果')} style={{ borderTop: '1px solid var(--border)', paddingTop: 16, outlineColor: 'var(--ring)' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 14, lineHeight: '20px', fontWeight: 500 }}>{t('本批示例结果', 'Fixture batch result', 'サンプルバッチ結果')}</h2>
        <p role="status" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: '20px' }}>{recovery === 'open'
          ? t('已打开本批结果。示例失败项与输入仍然保留，可以完成本地恢复。', 'Batch result opened. Fixture failures and input are preserved; local recovery is available.', 'バッチ結果を開きました。失敗項目と入力は保持され、ローカルで復旧できます。')
          : recovery === 'done' ? t('本地示例已恢复，同一条消息已更新为成功。', 'Local fixture recovered; the same message now shows success.', 'ローカルサンプルが復旧し、同じ通知が成功に更新されました。')
            : t('等待消息中的恢复操作。关闭通知后，这个结果区域仍然保留。', 'Waiting for the recovery action in a message. This result remains when notifications close.', '通知の復旧操作を待っています。通知を閉じてもこの結果領域は残ります。')}</p>
        <Button disabled={recovery !== 'open'} onClick={() => {
          setRecovery('done');
          studioToasts.add({ id: batchId, type: 'success', title: t('本批示例已恢复', 'Fixture batch recovered', 'サンプルバッチが復旧しました'), description: undefined, actionProps: undefined });
        }}>{t('完成本地恢复', 'Complete local recovery', 'ローカル復旧を完了')}</Button>
      </div>
    </main>
  </div>;
}

const meta = {
  title: 'Components/Message', component: MessageExample,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'StudioToaster and studioToasts share the product implementation. Local fixtures demonstrate semantics, timer pause, focus preservation, long selectable text, same-ID replacement and a working recovery action. No disk or service access.' } } },
  args: { theme: 'light', locale: 'zh-CN' },
  argTypes: { theme: { control: 'select', options: ['light', 'dark'] }, locale: { control: 'select', options: ['zh-CN', 'en', 'ja'] } },
} satisfies Meta<typeof MessageExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dusk: Story = { args: { theme: 'dark' } };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja', theme: 'dark' } };
