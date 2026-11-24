import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Loader2, Play, Square, Wallet, X } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { CopyKey, Language } from '@/locales';

export interface ShiftPaymentBreakdown {
  cash: number;
  instapay: number;
  vodafone_cash: number;
  card: number;
}

export interface StaffShiftSummary {
  id: number;
  userId: string;
  shiftDate: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'closed';
  deliveredOrdersCount: number;
  deliveredRevenue: number;
  paymentBreakdown: ShiftPaymentBreakdown;
  notes: string | null;
  employeeName?: string;
  employeeUsername?: string;
  employeeRole?: 'owner' | 'staff';
}

export interface DailyEmployeeRevenueRow {
  date: string;
  shifts: StaffShiftSummary[];
  offShiftOrdersCount: number;
  offShiftRevenue: number;
  deliveredOrdersCount: number;
  deliveredRevenue: number;
  paymentBreakdown: ShiftPaymentBreakdown;
}

export interface EmployeeProfileUser {
  userId: string;
  fullName: string;
  username: string;
  email: string;
  role: 'owner' | 'staff';
  status: 'approved' | 'pending' | 'rejected';
  staffAccess: boolean;
  permissions: string[];
}

export interface EmployeeRevenueProfile {
  employee: EmployeeProfileUser;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    totalShifts: number;
    activeShiftsCount: number;
    daysWorked: number;
    paymentBreakdown: ShiftPaymentBreakdown;
  };
  days: DailyEmployeeRevenueRow[];
}

export interface ShiftsOverviewResponse {
  todayDate: string;
  activeShifts: StaffShiftSummary[];
  closedShifts: StaffShiftSummary[];
  summary: {
    totalActiveShifts: number;
    totalClosedShifts: number;
    totalDeliveredOrders: number;
    totalDeliveredRevenue: number;
  };
}

export function getStaffAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('staff_token') : null;
  return token ? { 'x-staff-session': token, Authorization: `Bearer ${token}` } : {};
}

export function formatShiftClockTime(iso: string | null | undefined, language: Language = 'ar'): string {
  if (!iso) return language === 'ar' ? 'الآن' : 'Now';
  try {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(11, 16);
  }
}

function formatElapsedDuration(startedAtIso: string, nowMs: number): string {
  const startMs = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startMs)) return '00:00';
  const totalMinutes = Math.max(0, Math.floor((nowMs - startMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function useMyActiveShift(enabled: boolean) {
  return useQuery<{ activeShift: StaffShiftSummary | null }>({
    queryKey: ['/api/shifts/me'],
    enabled,
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await fetch('/api/shifts/me', {
        headers: getStaffAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to load active shift');
      }
      return res.json();
    },
  });
}

export function ShiftHeaderButton({
  language,
  t,
}: {
  language: Language;
  t: (key: CopyKey) => string;
}) {
  const queryClient = useQueryClient();
  const shiftQuery = useMyActiveShift(true);
  const activeShift = shiftQuery.data?.activeShift ?? null;
  const [modalOpen, setModalOpen] = useState(false);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [closedReceipt, setClosedReceipt] = useState<StaffShiftSummary | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!activeShift) return;
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [activeShift?.id]);

  useEffect(() => {
    if (!modalOpen && !closedReceipt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false);
        setClosedReceipt(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen, closedReceipt]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/shifts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getStaffAuthHeaders(),
        },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start shift');
      }
      return data as { shift: StaffShiftSummary };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts/overview'] });
    },
  });

  const endMutation = useMutation({
    mutationFn: async (notes: string) => {
      const res = await fetch('/api/shifts/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getStaffAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to end shift');
      }
      return data as { shift: StaffShiftSummary };
    },
    onSuccess: (data) => {
      setModalOpen(false);
      setHandoverNotes('');
      setClosedReceipt(data.shift);
      queryClient.invalidateQueries({ queryKey: ['/api/shifts/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts/overview'] });
      queryClient.invalidateQueries({ queryKey: ['employee-revenue-profile'] });
    },
  });

  if (shiftQuery.isLoading) {
    return null;
  }

  return (
    <>
      {activeShift ? (
        <button
          type="button"
          data-testid="button-active-shift"
          onClick={() => setModalOpen(true)}
          title={t('shiftHandoverTitle')}
          className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5 whitespace-nowrap rounded-xl border border-emerald-600/35 bg-emerald-500/12 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all"
        >
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="hidden sm:inline">{t('activeShift')}</span>
          <span className="font-mono-ui tabular-nums">
            {formatElapsedDuration(activeShift.startedAt, nowMs)}
          </span>
          <span className="hidden md:inline text-emerald-700/70 dark:text-emerald-400/70">·</span>
          <span className="hidden md:inline tabular-nums font-bold">
            {formatCurrency(activeShift.deliveredRevenue, language)}
          </span>
        </button>
      ) : (
        <button
          type="button"
          data-testid="button-start-shift"
          disabled={startMutation.isPending}
          onClick={() => startMutation.mutate()}
          className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5 whitespace-nowrap rounded-xl border border-amber-600/35 bg-amber-500/15 px-2 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold text-amber-900 dark:text-amber-300 hover:bg-amber-500/25 active:scale-95 transition-all disabled:opacity-50"
        >
          {startMutation.isPending ? (
            <Loader2 size={14} className="animate-spin shrink-0" />
          ) : (
            <Play size={13} className="fill-current shrink-0" />
          )}
          <span className="hidden sm:inline">{t('startShift')}</span>
          <span className="sm:hidden">{language === 'ar' ? 'وردية' : 'Shift'}</span>
        </button>
      )}

      {/* Active Shift Summary & Handover Modal */}
      {typeof document !== 'undefined' && modalOpen && activeShift && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          onClick={(e) => {
            if (e.target === e.currentTarget && !endMutation.isPending) {
              setModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  <Wallet size={20} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold">{t('shiftHandoverTitle')}</h2>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {language === 'ar' ? 'بدأت الساعة' : 'Started at'}{' '}
                    {formatShiftClockTime(activeShift.startedAt, language)} ·{' '}
                    {formatElapsedDuration(activeShift.startedAt, nowMs)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={t('cancel')}
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-muted/40 p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground">
                  {t('totalDeliveredRevenue')}
                </p>
                <p className="mt-1 font-display text-xl font-bold text-primary tabular-nums">
                  {formatCurrency(activeShift.deliveredRevenue, language)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground">
                  {t('deliveredOrdersCount')}
                </p>
                <p className="mt-1 font-display text-xl font-bold tabular-nums">
                  {activeShift.deliveredOrdersCount}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-card p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{language === 'ar' ? 'كاش / نقداً' : 'Cash'}</span>
                <strong className="tabular-nums">{formatCurrency(activeShift.paymentBreakdown.cash, language)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">InstaPay</span>
                <strong className="tabular-nums">{formatCurrency(activeShift.paymentBreakdown.instapay, language)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{language === 'ar' ? 'فودافون كاش' : 'Vodafone Cash'}</span>
                <strong className="tabular-nums">{formatCurrency(activeShift.paymentBreakdown.vodafone_cash, language)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{language === 'ar' ? 'فيزا / بطاقة' : 'Card'}</span>
                <strong className="tabular-nums">{formatCurrency(activeShift.paymentBreakdown.card, language)}</strong>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                {t('shiftHandoverNotes')}
              </label>
              <textarea
                rows={2}
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder={language === 'ar' ? 'أي ملاحظات عن العهدة أو تسليمات اليوم...' : 'Optional handover notes...'}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {endMutation.isError && (
              <p className="mt-2 text-xs font-semibold text-destructive">
                {(endMutation.error as Error).message}
              </p>
            )}

            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                disabled={endMutation.isPending}
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold text-foreground hover:bg-muted"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                data-testid="button-confirm-end-shift"
                disabled={endMutation.isPending}
                onClick={() => endMutation.mutate(handoverNotes)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-destructive py-2.5 text-xs font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
              >
                {endMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Square size={13} className="fill-current" />
                )}
                <span>{t('confirmEndShift')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Closed Shift Handover Confirmation Toast Modal */}
      {typeof document !== 'undefined' && closedReceipt && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          onClick={(e) => {
            if (e.target === e.currentTarget) setClosedReceipt(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-3xl border border-border bg-card p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={26} />
            </div>
            <h3 className="mt-3 font-display text-xl font-bold">
              {language === 'ar' ? 'تم إنهاء الوردية وحفظ الإيراد' : 'Shift Closed & Saved'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {language === 'ar'
                ? 'تم إرسال إجمالي الإيراد المسلّم إلى لوحة مالك المحل بنجاح.'
                : 'Your Delivered Revenue summary has been sent to the Admin dashboard.'}
            </p>
            <div className="mt-4 rounded-2xl bg-muted/60 p-4 space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {t('deliveredOrdersCount')}: <strong className="text-foreground tabular-nums">{closedReceipt.deliveredOrdersCount}</strong>
              </p>
              <p className="font-display text-2xl font-bold text-primary tabular-nums">
                {formatCurrency(closedReceipt.deliveredRevenue, language)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setClosedReceipt(null)}
              className="mt-5 w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              {language === 'ar' ? 'حسناً' : 'Done'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function ShiftReminderBanner({
  canOrder,
  t,
}: {
  canOrder: boolean;
  t: (key: CopyKey) => string;
}) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const shiftQuery = useMyActiveShift(canOrder);
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/shifts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getStaffAuthHeaders(),
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to start shift');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts/overview'] });
    },
  });

  if (!canOrder || dismissed || shiftQuery.isLoading || shiftQuery.data?.activeShift) {
    return null;
  }

  return (
    <div
      data-testid="banner-shift-reminder"
      className="mx-4 mt-4 lg:mx-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Clock3 size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
        <p className="font-semibold text-amber-950 dark:text-amber-200">
          {t('shiftSoftReminder')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={startMutation.isPending}
          onClick={() => startMutation.mutate()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 active:scale-95 transition-all disabled:opacity-50"
        >
          {startMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} className="fill-current" />}
          <span>{t('startShift')}</span>
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="rounded-lg p-1 text-amber-800/70 hover:bg-amber-500/20 hover:text-amber-950"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
