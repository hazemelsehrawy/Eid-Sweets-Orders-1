import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, KeyRound, Loader2, User, X } from 'lucide-react';
import { getStaffAuthHeaders } from '@/components/shifts/ShiftControlBar';
import type { Language } from '@/locales';

export interface StaffCredentialsMember {
  userId: string;
  name: string;
  username?: string;
  email?: string;
}

export function StaffCredentialsModal({
  member,
  language,
  onClose,
  onUpdated,
}: {
  member: StaffCredentialsMember | null;
  language: Language;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const initialUsername = member?.username || '';
  const [username, setUsername] = useState(initialUsername);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!member) {
      setUsername('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      return;
    }
    setUsername(member.username || '');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
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
  }, [member, isSubmitting, onClose]);

  if (!member || typeof document === 'undefined') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');

    const cleanedUsername = username.trim().toLowerCase();
    const originalUsername = (member.username || '').trim().toLowerCase();
    const usernameChanged = cleanedUsername !== '' && cleanedUsername !== originalUsername;

    if (cleanedUsername.length < 3) {
      setError(
        language === 'ar'
          ? 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل.'
          : 'Username must be at least 3 characters.',
      );
      return;
    }
    if (/\s/.test(cleanedUsername)) {
      setError(
        language === 'ar'
          ? 'اسم المستخدم يجب ألا يحتوي على مسافات.'
          : 'Username cannot contain spaces.',
      );
      return;
    }

    if (newPassword.length > 0) {
      if (newPassword.length < 6) {
        setError(
          language === 'ar'
            ? 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.'
            : 'New password must be at least 6 characters.',
        );
        return;
      }
      if (newPassword !== confirmPassword) {
        setError(
          language === 'ar'
            ? 'كلمتا المرور غير متطابقتين.'
            : 'Passwords do not match.',
        );
        return;
      }
    }

    if (!usernameChanged && newPassword.length === 0) {
      setError(
        language === 'ar'
          ? 'قم بتعديل اسم المستخدم أو إدخال كلمة مرور جديدة أولاً.'
          : 'Change the username or enter a new password first.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, string> = {};
      if (usernameChanged) payload.username = cleanedUsername;
      if (newPassword.length > 0) payload.newPassword = newPassword;

      const res = await fetch(
        `/api/staff/users/${encodeURIComponent(member.userId)}/credentials`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getStaffAuthHeaders(),
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error ||
            (language === 'ar'
              ? 'تعذر تحديث بيانات دخول الموظف.'
              : 'Failed to update staff credentials.'),
        );
        return;
      }
      onUpdated();
      onClose();
    } catch {
      setError(
        language === 'ar'
          ? 'تعذر الاتصال بالخادم.'
          : 'Failed to connect to server.',
      );
    } finally {
      setIsSubmitting(false);
    }
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
        data-testid="modal-edit-staff-credentials"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.18)] text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)]">
              <KeyRound size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-muted-foreground">
                {language === 'ar' ? 'تعديل بيانات دخول الموظف' : 'Edit Staff Login'}
              </p>
              <h3 className="font-display text-lg font-bold truncate">{member.name}</h3>
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5">
              {language === 'ar' ? 'اسم المستخدم:' : 'Username:'}
            </label>
            <div className="relative">
              <User size={15} className="absolute top-1/2 -translate-y-1/2 start-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                data-testid="input-edit-staff-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ahmed"
                dir="ltr"
                className="w-full rounded-xl border border-input bg-background ps-9 pe-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5">
              {language === 'ar'
                ? 'كلمة المرور الجديدة (اتركها فارغة للإبقاء على الحالية):'
                : 'New Password (leave blank to keep current):'}
            </label>
            <input
              type="password"
              data-testid="input-edit-staff-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {newPassword.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                {language === 'ar' ? 'تأكيد كلمة المرور الجديدة:' : 'Confirm New Password:'}
              </label>
              <input
                type="password"
                required
                data-testid="input-edit-staff-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {error && (
            <div
              data-testid="alert-edit-credentials-error"
              className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive flex items-start gap-2"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
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
              data-testid="button-save-staff-credentials"
              disabled={isSubmitting}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{language === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
