import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import { getStaffAuthHeaders } from '@/components/shifts/ShiftControlBar';
import type { Language } from '@/locales';

export interface OverrideApiError {
  status: number;
  message: string;
  code?: string;
}

export interface OverridePasswordStatusResponse {
  isConfigured: boolean;
  updatedAt: string | null;
}

export async function patchOrderWithOverride(
  orderId: number,
  payload: Record<string, unknown>,
  overridePassword?: string,
  overrideReason?: string,
) {
  const bodyPayload: Record<string, unknown> = { ...payload };
  if (overridePassword !== undefined) {
    bodyPayload.overridePassword = overridePassword;
  }
  if (overrideReason?.trim()) {
    bodyPayload.overrideReason = overrideReason.trim();
  }

  const res = await fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify(bodyPayload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: OverrideApiError = {
      status: res.status,
      message: data?.error || 'Failed to update order',
      code: data?.code,
    };
    throw err;
  }
  return data;
}

export async function bulkUpdateStatusWithOverride(
  orderIds: number[],
  status: string,
  overridePassword?: string,
  overrideReason?: string,
) {
  const bodyPayload: Record<string, unknown> = { orderIds, status };
  if (overridePassword !== undefined) {
    bodyPayload.overridePassword = overridePassword;
  }
  if (overrideReason?.trim()) {
    bodyPayload.overrideReason = overrideReason.trim();
  }

  const res = await fetch('/api/orders/bulk-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify(bodyPayload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: OverrideApiError = {
      status: res.status,
      message: data?.error || 'Failed to bulk update orders',
      code: data?.code,
    };
    throw err;
  }
  return data;
}

export function OverridePasswordPromptModal({
  isOpen,
  language,
  actionSummary,
  isSubmitting,
  errorMessage,
  errorCode,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  language: Language;
  actionSummary: string;
  isSubmitting: boolean;
  errorMessage?: string;
  errorCode?: string;
  onClose: () => void;
  onConfirm: (password: string, reason: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setReason('');
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isSubmitting) return;
    onConfirm(password.trim(), reason.trim());
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
    >
      <div
        data-testid="modal-override-password-prompt"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <Lock size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                {language === 'ar' ? 'حماية الطلبات المستلمة' : 'Collected Order Protection'}
              </p>
              <h3 className="font-display text-lg font-bold">
                {language === 'ar' ? 'مطلوب كلمة مرور المشرف' : 'Supervisor Override Password'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted"
            aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-3.5 text-xs leading-5 text-foreground">
          {actionSummary}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5">
              {language === 'ar' ? 'كلمة مرور التعديل (من الإدارة):' : 'Override Password / PIN:'}
            </label>
            <input
              ref={inputRef}
              type="password"
              required
              data-testid="input-override-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5">
              {language === 'ar' ? 'سبب التعديل (اختياري):' : 'Reason for change (optional):'}
            </label>
            <input
              type="text"
              data-testid="input-override-reason"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                language === 'ar'
                  ? 'مثال: خطأ إدخال من الكاشير / استبدال العميل...'
                  : 'e.g. Cashier misclick / customer exchanged box...'
              }
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {errorMessage && (
            <div
              data-testid="alert-override-error"
              className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive flex items-start gap-2"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>{errorMessage}</p>
                {errorCode === 'OVERRIDE_NOT_CONFIGURED' && (
                  <p className="text-[11px] font-normal opacity-90">
                    {language === 'ar'
                      ? 'اطلب من مالك المحل الدخول إلى «فريق المحل ← كلمة مرور تعديل الطلبات المستلمة» لتعيينها.'
                      : 'Ask the Shop Owner to configure this password in Team Settings first.'}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold text-foreground hover:bg-muted"
            >
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              data-testid="button-confirm-override"
              disabled={isSubmitting || !password.trim()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
              <span>{language === 'ar' ? 'تأكيد وتنفيذ التعديل' : 'Verify & Apply'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function OverridePasswordSettingsCard({
  language,
  compact = false,
}: {
  language: Language;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const statusQuery = useQuery<OverridePasswordStatusResponse>({
    queryKey: ['/api/staff/override-password'],
    queryFn: async () => {
      const res = await fetch('/api/staff/override-password', {
        headers: getStaffAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load override password status');
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (pwd: string) => {
      const res = await fetch('/api/staff/override-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getStaffAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ newPassword: pwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save override password');
      }
      return data as OverridePasswordStatusResponse;
    },
    onSuccess: () => {
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({
        type: 'success',
        text: language === 'ar'
          ? 'تم حفظ وتحديث كلمة مرور تعديل الطلبات المستلمة بنجاح.'
          : 'Collected order override password updated successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/override-password'] });
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', text: err.message });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/staff/override-password', {
        method: 'DELETE',
        headers: getStaffAuthHeaders(),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to clear override password');
      }
      return data;
    },
    onSuccess: () => {
      setFeedback({
        type: 'success',
        text: language === 'ar'
          ? 'تم إلغاء كلمة المرور — لن يتمكن أي موظف من تعديل الطلبات المستلمة حالياً.'
          : 'Override password cleared — all staff edits on collected orders are locked.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/staff/override-password'] });
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', text: err.message });
    },
  });

  const isConfigured = Boolean(statusQuery.data?.isConfigured);
  const updatedAtLabel = (() => {
    const raw = statusQuery.data?.updatedAt;
    if (!raw) return '';
    try {
      return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
        timeZone: 'Africa/Cairo',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(raw));
    } catch {
      return String(raw).slice(0, 16);
    }
  })();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const trimmed = newPassword.trim();
    if (trimmed.length < 4) {
      setFeedback({
        type: 'error',
        text: language === 'ar'
          ? 'يجب أن تكون كلمة المرور 4 أحرف أو أرقام على الأقل.'
          : 'Password/PIN must be at least 4 characters.',
      });
      return;
    }
    if (trimmed !== confirmPassword.trim()) {
      setFeedback({
        type: 'error',
        text: language === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.',
      });
      return;
    }
    saveMutation.mutate(trimmed);
  };

  return (
    <section
      data-testid="card-override-password-settings"
      className={compact ? 'space-y-4' : 'rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm space-y-4'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.18)] text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)]">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-foreground">
              {language === 'ar'
                ? 'كلمة مرور تعديل الطلبات المستلمة'
                : 'Collected Orders Override Password'}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {language === 'ar'
                ? 'بعد تسليم الطلب (تم الاستلام)، لا يمكن لأي موظف تغييره إلى مرفوض أو تعديل حالته أو دفعه إلا بهذه الكلمة. بصفتك المالك، يمكنك التعديل مباشرة وتغيير هذه الكلمة في أي وقت.'
                : 'Once an order is marked Collected, staff cannot revert, decline, or edit its payment without this password/PIN. As Shop Owner, you bypass it automatically and can update it anytime.'}
            </p>
          </div>
        </div>

        <span
          data-testid="badge-override-password-status"
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
            isConfigured
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
          }`}
        >
          {isConfigured
            ? language === 'ar'
              ? 'مفعّلة'
              : 'Active'
            : language === 'ar'
            ? 'غير معيّنة — التعديل مغلق'
            : 'Not Set — Locked'}
        </span>
      </div>

      {isConfigured && updatedAtLabel && (
        <p className="text-[11px] text-muted-foreground">
          {language === 'ar' ? 'آخر تحديث:' : 'Last updated:'} <strong dir="ltr">{updatedAtLabel}</strong>
        </p>
      )}

      <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">
            {isConfigured
              ? language === 'ar'
                ? 'كلمة مرور / PIN جديدة'
                : 'New Password / PIN'
              : language === 'ar'
              ? 'تعيين كلمة مرور / PIN'
              : 'Set Password / PIN'}
          </label>
          <input
            type="password"
            required
            data-testid="input-admin-set-override-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={language === 'ar' ? '4 أحرف أو أرقام فأكثر' : 'Min 4 chars / digits'}
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">
            {language === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password / PIN'}
          </label>
          <input
            type="password"
            required
            data-testid="input-admin-confirm-override-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••"
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="sm:col-span-2 flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="submit"
            data-testid="button-save-override-password"
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            <span>
              {isConfigured
                ? language === 'ar'
                  ? 'تغيير كلمة المرور'
                  : 'Update Override Password'
                : language === 'ar'
                ? 'حفظ وتفعيل كلمة المرور'
                : 'Save Override Password'}
            </span>
          </button>

          {isConfigured && (
            <button
              type="button"
              data-testid="button-clear-override-password"
              disabled={clearMutation.isPending}
              onClick={() => {
                const ok = window.confirm(
                  language === 'ar'
                    ? 'هل تريد إلغاء كلمة المرور؟ عند الإلغاء لن يتمكن أي موظف من تعديل الطلبات المستلمة حتى تعيّن كلمة جديدة.'
                    : 'Clear override password? Staff will be blocked from editing any collected orders until you set a new password.',
                );
                if (ok) clearMutation.mutate();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3.5 py-2.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {clearMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              <span>{language === 'ar' ? 'إلغاء التفعيل (قفل التعديل)' : 'Disable (Lock Staff Edits)'}</span>
            </button>
          )}
        </div>
      </form>

      {feedback && (
        <div
          className={`rounded-xl border p-3 text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{feedback.text}</span>
        </div>
      )}
    </section>
  );
}

export function OverridePasswordSettingsDialog({
  isOpen,
  onClose,
  language,
}: {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-end mb-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted"
            aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>
        <OverridePasswordSettingsCard language={language} compact />
      </div>
    </div>,
    document.body,
  );
}
