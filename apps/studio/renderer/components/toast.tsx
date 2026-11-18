import { Toast } from '@base-ui/react/toast';
import { CheckCircle2, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import './toast.css';

export const studioToasts = Toast.createToastManager();

// Keep the existing manager API, including Base UI's same-ID upserts and updater callbacks.
// Recovery stays available until the author acts or dismisses it; callers can set a timeout.
const addToast = studioToasts.add;
const updateToast = studioToasts.update;
function defaultTimeout(message: { type?: string; actionProps?: unknown }) {
  return message.type === 'error' || message.actionProps ? 0 : 4500;
}
function semanticsChanged(previous: { type?: string; actionProps?: unknown }, next: { type?: string; actionProps?: unknown }) {
  return previous.type !== next.type || !!previous.actionProps !== !!next.actionProps;
}
studioToasts.add = options => {
  if (options.id) {
    let updated = false;
    const { id, ...patch } = options;
    updateToast(id, previous => {
      updated = true;
      const next = { ...previous, ...patch };
      return { ...patch, timeout: patch.timeout ?? (semanticsChanged(previous, next) ? defaultTimeout(next) : previous.timeout ?? defaultTimeout(next)) };
    });
    // Supplying the retained duration refreshes an upsert's timer, as Base UI add does.
    // Missing and ending IDs fall through to Base UI's normal new-toast lifecycle.
    if (updated) return id;
  }
  return addToast({ ...options, type: options.type ?? 'success', timeout: options.timeout ?? defaultTimeout(options) });
};
studioToasts.update = (id, updates) => updateToast(id, previous => {
  const patch = typeof updates === 'function' ? updates(previous) : updates;
  const next = { ...previous, ...patch };
  if (patch.timeout !== undefined || !semanticsChanged(previous, next)) return patch;
  return { ...patch, timeout: defaultTimeout(next) };
});

const messageIcons = { success: CheckCircle2, error: CircleX, warning: TriangleAlert, info: Info };

function ToastList({ locale, top }: { locale: string; top?: number }) {
  const { toasts } = Toast.useToastManager();
  const label = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return <Toast.Portal container={document.getElementById('studio-portals')}>
    <Toast.Viewport className="studio-toasts" aria-label={label('通知（F6）', 'Notifications (F6)', '通知（F6）')}
      style={top === undefined ? undefined : { insetBlockStart: top, maxHeight: `calc(100dvh - ${top}px)` }}>
      {toasts.map(toast => {
        const type = toast.type && Object.hasOwn(messageIcons, toast.type) ? toast.type as keyof typeof messageIcons : 'info';
        const Icon = messageIcons[type];
        return <Toast.Root key={toast.id} toast={toast} className="studio-toast" data-message-type={type} data-message-id={toast.id} swipeDirection={[]}>
          <Icon className="studio-toast-icon" size={16} aria-hidden="true" />
          <Toast.Content className="studio-toast-content">
            <Toast.Title className="studio-toast-title" />
            <Toast.Description className="studio-toast-description" />
            <Toast.Action className="studio-toast-action" />
          </Toast.Content>
          <Toast.Close className="studio-toast-close" aria-label={label('关闭通知', 'Dismiss notification', '通知を閉じる')}><X size={16} aria-hidden="true" /></Toast.Close>
        </Toast.Root>;
      })}
    </Toast.Viewport>
  </Toast.Portal>;
}

export function StudioToaster({ locale, workbenchChrome }: { locale: string; workbenchChrome?: RefObject<HTMLElement | null> }) {
  const [top, setTop] = useState<number>();
  useEffect(() => {
    const chrome = workbenchChrome?.current;
    if (!chrome) return;
    // The viewport adds 24px of padding above the first message. Together with
    // this gap it clears the dock tabs even when the command bar wraps.
    const position = () => setTop(Math.ceil(chrome.getBoundingClientRect().bottom) + 16);
    position();
    const observer = new ResizeObserver(position);
    observer.observe(chrome);
    return () => observer.disconnect();
  }, [workbenchChrome]);
  return <Toast.Provider toastManager={studioToasts} timeout={4500} limit={3}><ToastList locale={locale} top={top}/></Toast.Provider>;
}
