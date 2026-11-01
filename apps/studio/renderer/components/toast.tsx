import { Toast } from '@base-ui/react/toast';
import { CheckCircle2, X } from 'lucide-react';

export const studioToasts = Toast.createToastManager();

function ToastList({ locale }: { locale: string }) {
  const { toasts } = Toast.useToastManager();
  return <Toast.Portal container={document.getElementById('studio-portals')}>
    <Toast.Viewport className="studio-toasts">
      {toasts.map(toast => <Toast.Root key={toast.id} toast={toast} className="studio-toast">
        <CheckCircle2 size={14} aria-hidden="true" />
        <Toast.Content className="studio-toast-content"><Toast.Title className="studio-toast-title" /><Toast.Description /></Toast.Content>
        <Toast.Close aria-label={locale === 'en' ? 'Dismiss notification' : locale === 'ja' ? '通知を閉じる' : '关闭通知'}><X size={15} /></Toast.Close>
      </Toast.Root>)}
    </Toast.Viewport>
  </Toast.Portal>;
}

export function StudioToaster({ locale }: { locale: string }) {
  return <Toast.Provider toastManager={studioToasts} timeout={4500} limit={3}><ToastList locale={locale}/></Toast.Provider>;
}
