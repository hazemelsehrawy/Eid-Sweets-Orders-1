import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { playOrderChime } from '@/lib/audio';
import { getWhatsAppLink } from '@/lib/whatsapp';
import { PrintableReceipt } from '@/components/receipt/PrintableReceipt';
import { copy, type Language, type CopyKey } from '@/locales';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckSquare,
  Square,
  ChefHat,
  ClipboardList,
  Clock3,
  Copy,
  Crown,
  DollarSign,
  Download,
  ExternalLink,
  Filter,
  KeyRound,
  Loader2,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  UserX,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  X,
  CreditCard,
  Minus,
  Zap,
} from 'lucide-react';
import {
  getHijriDateInfo,
  formatDualDate,
  getUpcomingEidMilestones,
  useHijriOffset,
  getStoredSightingOffset,
} from '@/lib/hijri';
import {
  getExportOrdersQueryKey,
  getGetDashboardAnalyticsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetOrderQueryKey,
  getGetStaffAccessQueryKey,
  getListCategoriesQueryKey,
  getListOrdersQueryKey,
  getListStaffUsersQueryKey,
  getTrackOrderQueryKey,
  useClaimOwnerAccess,
  useGetStaffAccess,
  useListStaffUsers,
  useUpdateStaffUser,
  type Category,
  type CategoryTotal,
  type DashboardAnalytics,
  type DashboardSummary,
  type GetDashboardAnalyticsParams,
  type Order,
  type OrderStatus,
  type StaffAccess as ApiStaffAccess,
  type StaffMember,
  type StaffPermission,
  useCreateCategory,
  useCreateOrder,
  useDeleteCategory,
  useExportOrders,
  useGetDashboardAnalytics,
  useGetDashboardSummary,
  useGetOrder,
  useListCategories,
  useListOrders,
  useTrackOrder,
  useUpdateCategory,
  useUpdateOrder,
  useBulkUpdateOrderStatus,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import './index.css';

const queryClient = new QueryClient();
const rawClerkKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) || '';
const clerkPubKey = rawClerkKey
  ? publishableKeyFromHost(window.location.hostname, rawClerkKey)
  : '';
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const isClerkEnabled = Boolean(clerkPubKey && clerkPubKey.startsWith('pk_'));

interface SignInResult {
  success: boolean;
  error?: string;
  pendingApproval?: boolean;
}

interface UnifiedAuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
  signIn: (password?: string, username?: string, role?: 'owner' | 'staff') => Promise<SignInResult>;
}

const UnifiedAuthContext = createContext<UnifiedAuthContextType>({
  isLoaded: true,
  isSignedIn: false,
  signOut: async () => {},
  signIn: async () => ({ success: false }),
});

const useUnifiedAuth = () => useContext(UnifiedAuthContext);

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(164 31% 18%)',
    colorForeground: 'hsl(164 31% 18%)',
    colorMutedForeground: 'hsl(164 14% 46%)',
    colorDanger: 'hsl(3 58% 48%)',
    colorBackground: 'hsl(40 50% 98%)',
    colorInput: 'hsl(38 44% 95%)',
    colorInputForeground: 'hsl(164 31% 18%)',
    colorNeutral: 'hsl(37 25% 84%)',
    fontFamily: 'Noto Kufi Arabic, Manrope, sans-serif',
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[hsl(40_50%_98%)] rounded-[28px] w-[440px] max-w-full overflow-hidden border border-[hsl(37_25%_84%)] shadow-[0_18px_45px_hsl(164_31%_18%/0.1)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-display text-[hsl(164_31%_18%)]',
    headerSubtitle: 'text-[hsl(164_14%_46%)]',
    socialButtonsBlockButtonText: 'text-[hsl(164_31%_18%)]',
    formFieldLabel: 'font-semibold text-[hsl(164_31%_18%)]',
    footerActionLink: 'font-semibold text-[hsl(9_54%_55%)]',
    footerActionText: 'text-[hsl(164_14%_46%)]',
    dividerText: 'text-[hsl(164_14%_46%)]',
    identityPreviewEditButton: 'text-[hsl(9_54%_55%)]',
    formFieldSuccessText: 'text-[hsl(153_38%_30%)]',
    alertText: 'text-[hsl(3_58%_42%)]',
    logoBox: 'mb-4',
    logoImage: 'h-10 w-auto',
    socialButtonsBlockButton: 'border-[hsl(37_25%_84%)] bg-[hsl(40_50%_98%)]',
    formButtonPrimary: 'bg-[hsl(164_31%_18%)] text-[hsl(39_45%_94%)] hover:bg-[hsl(164_31%_25%)]',
    formFieldInput: 'border-[hsl(37_25%_84%)] bg-[hsl(38_44%_95%)] text-[hsl(164_31%_18%)]',
    footerAction: 'border-t border-[hsl(37_25%_84%)]',
    dividerLine: 'bg-[hsl(37_25%_84%)]',
    alert: 'border-[hsl(3_58%_48%/0.25)] bg-[hsl(3_58%_48%/0.06)]',
    otpCodeFieldInput: 'border-[hsl(37_25%_84%)] bg-[hsl(38_44%_95%)]',
    formFieldRow: 'gap-2',
    main: 'px-7 pb-7 pt-2',
  },
};
const SWEET_IMAGE_PRESETS = [
  { label: 'كعك العيد', labelEn: 'Kahk', url: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80' },
  { label: 'غريبة', labelEn: 'Ghorayeba', url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80' },
  { label: 'بيتي فور', labelEn: 'Petit Four', url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80' },
  { label: 'بسكويت', labelEn: 'Biscuits', url: 'https://images.unsplash.com/photo-1548848221-0c2e497ed557?auto=format&fit=crop&w=800&q=80' },
  { label: 'معمول', labelEn: 'Maamoul', url: 'https://images.unsplash.com/photo-1579372786545-d24232daf58c?auto=format&fit=crop&w=800&q=80' },
  { label: 'سابليه', labelEn: 'Sablé', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80' },
  { label: 'حلويات مشكلة', labelEn: 'Mixed Sweets', url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80' },
];

function getCategoryFallbackImage(name?: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('كعك') || n.includes('kahk')) return 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80';
  if (n.includes('غريب') || n.includes('ghorayeba')) return 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80';
  if (n.includes('بيتي فور') || n.includes('بيديفور') || n.includes('petit')) return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80';
  if (n.includes('بسكوت') || n.includes('بسكويت') || n.includes('biscuit')) return 'https://images.unsplash.com/photo-1548848221-0c2e497ed557?auto=format&fit=crop&w=800&q=80';
  if (n.includes('معمول') || n.includes('maamoul')) return 'https://images.unsplash.com/photo-1579372786545-d24232daf58c?auto=format&fit=crop&w=800&q=80';
  if (n.includes('سابليه') || n.includes('sable')) return 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80';
  return 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80';
}

function compressImageFile(file: File, maxWidth = 800, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const money = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' });

const getTodayCairo = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};


const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void; t: (key: CopyKey) => string } | null>(null);

function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}

function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem('eid-sweets-language') as Language) || 'ar');
  const setLanguage = (next: Language) => {
    localStorage.setItem('eid-sweets-language', next);
    setLanguageState(next);
  };
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  const t = (key: CopyKey) => copy[language][key];
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

const StaffAccessContext = createContext<ApiStaffAccess | null>(null);

function useStaffAccess() {
  const context = useContext(StaffAccessContext);
  if (!context) throw new Error('useStaffAccess must be used within StaffAccessProvider');
  return context;
}

function hasPermission(access: ApiStaffAccess, permission: StaffPermission) {
  return access.role === 'owner' || access.permissions.includes(permission);
}

function StaffAccessProvider({ access, children }: { access: ApiStaffAccess; children: ReactNode }) {
  return <StaffAccessContext.Provider value={access}>{children}</StaffAccessContext.Provider>;
}

function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();
  return <button type="button" data-testid="button-language-toggle" onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">{t('language')}</button>;
}

const statusLabels: Record<string, string> = {
  pending: 'New request',
  accepted: 'Accepted',
  rejected: 'Declined',
  preparing: 'In the kitchen',
  ready: 'Ready for pickup',
  delivered: 'Collected',
};
const statusLabelsAr: Record<string, string> = {
  pending: 'طلب جديد',
  accepted: 'تم القبول',
  rejected: 'مرفوض',
  preparing: 'في التجهيز',
  ready: 'جاهز للاستلام',
  delivered: 'تم الاستلام',
};
const getStatusLabel = (status: string, language: Language) => (language === 'ar' ? statusLabelsAr[status] : statusLabels[status]) || status;
const statusTone: Record<string, string> = {
  pending: 'bg-[hsl(38_74%_63%/0.2)] text-[hsl(164_31%_18%)]',
  accepted: 'bg-[hsl(153_28%_48%/0.15)] text-[hsl(153_38%_30%)]',
  rejected: 'bg-[hsl(3_58%_48%/0.12)] text-[hsl(3_58%_42%)]',
  preparing: 'bg-[hsl(207_42%_88%)] text-[hsl(207_42%_30%)]',
  ready: 'bg-[hsl(34_65%_48%/0.18)] text-[hsl(34_65%_35%)]',
  delivered: 'bg-[hsl(164_31%_18%/0.1)] text-[hsl(164_31%_28%)]',
};
const unitLabels: Record<string, string> = { kilo: 'kg', half_kilo: '0.5 kg', box: 'box', piece: 'piece' };
const unitLabelsAr: Record<string, string> = { kilo: 'كيلو', half_kilo: 'نصف كيلو', box: 'علبة', piece: 'قطعة' };
const getUnitLabel = (unit: string, language: Language) => (language === 'ar' ? unitLabelsAr[unit] : unitLabels[unit]) || unit;

const paymentMethodLabelsAr: Record<string, string> = {
  cash: 'كاش / نقدًا',
  instapay: 'إنستاباي / InstaPay',
  vodafone_cash: 'فودافون كاش / محفظة',
  card: 'فيزا / بطاقة بنكية',
};
const paymentMethodLabelsEn: Record<string, string> = {
  cash: 'Cash',
  instapay: 'InstaPay',
  vodafone_cash: 'Vodafone Cash',
  card: 'Card',
};
const getPaymentMethodLabel = (method: string | undefined, language: Language) => {
  const m = method || 'cash';
  return (language === 'ar' ? paymentMethodLabelsAr[m] : paymentMethodLabelsEn[m]) || m;
};

const paymentStatusLabelsAr: Record<string, string> = {
  unpaid: 'غير مدفوع',
  partially_paid: 'عربون مسدد',
  paid: 'مدفوع بالكامل',
};
const paymentStatusLabelsEn: Record<string, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Deposit Paid',
  paid: 'Fully Paid',
};
const getPaymentStatusLabel = (status: string | undefined, language: Language) => {
  const s = status || 'unpaid';
  return (language === 'ar' ? paymentStatusLabelsAr[s] : paymentStatusLabelsEn[s]) || s;
};

function Logo({ light = false }: { light?: boolean }) {
  const { language } = useLanguage();
  return (
    <div className="flex items-center gap-2 sm:gap-3 shrink-0" data-testid="brand-mark">
      <div className={`relative grid size-8 sm:size-10 place-items-center rounded-[12px] sm:rounded-[14px] shrink-0 ${light ? 'bg-[hsl(38_74%_63%)] text-[hsl(164_31%_18%)]' : 'bg-[hsl(164_31%_18%)] text-[hsl(38_74%_63%)]'}`}>
        <Sparkles size={16} strokeWidth={2.2} className="sm:size-[18px]" />
        <span className="absolute -right-0.5 -top-0.5 sm:-right-1 sm:-top-1 size-2 rounded-full bg-[hsl(9_54%_63%)]" />
      </div>
      <div>
        <p dir="rtl" className={`font-display text-base sm:text-lg leading-none ${light ? 'text-[hsl(39_45%_94%)]' : 'text-[hsl(164_31%_18%)]'}`}>حلويات فتوح</p>
        <p dir="rtl" className={`mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-bold ${light ? 'text-[hsl(39_18%_69%)]' : 'text-[hsl(164_14%_46%)]'}`}>{language === 'ar' ? 'حلويات العيد' : 'Eid sweets'}</p>
      </div>
    </div>
  );
}

function PageLoader({ label = 'Bringing up the counter' }: { label?: string }) {
  const { t } = useLanguage();
  return <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-sm text-muted-foreground"><div className="skeleton h-2 w-32 rounded-full" /><div className="skeleton h-2 w-24 rounded-full" /><span>{label === 'Bringing up the counter' ? t('loading') : label}</span></div>;
}

function QueryError({ retry }: { retry?: () => void }) {
  const { t } = useLanguage();
  return <div className="rounded-2xl border border-[hsl(3_58%_48%/0.25)] bg-[hsl(3_58%_48%/0.06)] p-6 text-center"><p className="font-semibold text-[hsl(3_58%_42%)]">{t('cannotReach')}</p><p className="mt-1 text-sm text-muted-foreground">{t('connection')}</p>{retry && <button data-testid="button-retry" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><RefreshCw size={15} /> {t('retry')}</button>}</div>;
}

function StatusPill({ status }: { status: string }) {
  const { language } = useLanguage();
  return <span data-testid={`status-${status}`} className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${statusTone[status] || statusTone.pending}`}>{getStatusLabel(status, language)}</span>;
}

function ChangePasswordDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { language } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 3) {
      setError(language === 'ar' ? 'كلمة المرور الجديدة يجب أن تكون 3 أحرف على الأقل' : 'New password must be at least 3 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(language === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/staff/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }, 1500);
      } else {
        setError(data.error || (language === 'ar' ? 'فشل تغيير كلمة المرور' : 'Failed to change password'));
      }
    } catch {
      setError(language === 'ar' ? 'تعذر الاتصال بالخادم' : 'Failed to reach server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.2)] text-[hsl(34_65%_35%)]">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">
                {language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {language === 'ar' ? 'تحديث كلمة مرور المالك (admin)' : 'Update owner password (admin)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted" aria-label="إغلاق">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="my-8 rounded-2xl bg-[hsl(153_28%_48%/0.15)] p-5 text-center text-sm font-bold text-[hsl(153_38%_30%)] flex flex-col items-center gap-2">
            <Check size={28} className="text-[hsl(153_38%_30%)]" />
            <span>{language === 'ar' ? 'تم تغيير كلمة المرور بنجاح!' : 'Password updated successfully!'}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                {language === 'ar' ? 'كلمة المرور الحالية' : 'Current Password'}
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="admin"
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                {language === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                {language === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {language === 'ar' ? 'حفظ كلمة المرور' : 'Save Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function HijriSettingsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { language } = useLanguage();
  const [offset, setOffset] = useHijriOffset();
  const [tempOffset, setTempOffset] = useState(offset);

  useEffect(() => {
    if (isOpen) {
      setTempOffset(offset);
    }
  }, [isOpen, offset]);

  if (!isOpen) return null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const previewDual = formatDualDate(todayIso, language, tempOffset);

  const handleSave = () => {
    setOffset(tempOffset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.2)] text-[hsl(38_74%_50%)]">
              <Moon size={20} />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">
                {language === 'ar' ? 'ضبط رؤية هلال العيد' : 'Moon Sighting Adjustment'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {language === 'ar' ? 'توافق التقويم الهجري مع دار الإفتاء المصرية' : 'Align Hijri calendar with Dar Al-Ifta sighting'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="إغلاق"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-sm">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {language === 'ar'
              ? 'يتم حساب التقويم الهجري فلكياً بأعلى دقة. عند إعلان دار الإفتاء رسمياً ثبوت رؤية الهلال، يمكنك تقديم أو تأخير التقويم بيوم واحد ليتوافق المتجر وقوائم المعمل وحجوزات العملاء فوراً مع الرؤية الشرعية دون أي مساس بقواعد البيانات.'
              : 'The Hijri calendar is astronomically computed. Once official crescent sighting is announced by religious authorities, you can shift the calendar by ±1 day to immediately align customer bookings and kitchen sheets.'}
          </p>

          {/* Current Preview Card */}
          <div className="rounded-2xl border border-[hsl(38_74%_63%/0.4)] bg-[hsl(38_74%_63%/0.08)] p-4 text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {language === 'ar' ? 'معاينة تاريخ اليوم بالتعديل الحالي:' : 'Today Preview with Active Offset:'}
            </span>
            <p className="mt-1.5 font-display text-base sm:text-lg font-bold text-foreground">
              🌙 {previewDual}
            </p>
          </div>

          {/* Stepper Buttons */}
          <div>
            <label className="block text-xs font-bold mb-2">
              {language === 'ar' ? 'إزاحة الرؤية الشرعية:' : 'Sighting Day Offset:'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTempOffset(-1)}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 font-bold transition-all ${
                  tempOffset === -1
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                <span className="text-sm">-1 {language === 'ar' ? 'يوم' : 'day'}</span>
                <span className="text-[10px] opacity-80 mt-0.5">
                  {language === 'ar' ? 'تأخير يوم' : 'Delay 1 day'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTempOffset(0)}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 font-bold transition-all ${
                  tempOffset === 0
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                <span className="text-sm">0 {language === 'ar' ? 'يوم' : 'days'}</span>
                <span className="text-[10px] opacity-80 mt-0.5">
                  {language === 'ar' ? 'فلكي افتراضي' : 'Default Umm al-Qura'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTempOffset(1)}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 font-bold transition-all ${
                  tempOffset === 1
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                <span className="text-sm">+1 {language === 'ar' ? 'يوم' : 'day'}</span>
                <span className="text-[10px] opacity-80 mt-0.5">
                  {language === 'ar' ? 'تقديم يوم' : 'Advance 1 day'}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
          >
            {language === 'ar' ? 'حفظ وتطبيق فوراً' : 'Save & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickOrderPosModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const categoriesQuery = useListCategories({
    query: {
      queryKey: getListCategoriesQueryKey(),
      staleTime: 5_000,
    },
  });
  const createOrder = useCreateOrder();

  const [search, setSearch] = useState('');
  const [filterUnit, setFilterUnit] = useState<'all' | 'kilo' | 'box' | 'piece'>('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'instapay' | 'card' | 'vodafone_cash'>('cash');
  const [receivedCash, setReceivedCash] = useState('');
  const [notes, setNotes] = useState('');
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  // Close on Escape unless pending
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !createOrder.isPending) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, createOrder.isPending]);

  // Reset completion state on fresh open
  useEffect(() => {
    if (isOpen) {
      setLastCompletedOrder(null);
      setPrintingOrder(null);
    }
  }, [isOpen]);

  const activeCategories = useMemo(() => {
    return Array.isArray(categoriesQuery.data)
      ? categoriesQuery.data.filter((c) => c.isActive !== false)
      : [];
  }, [categoriesQuery.data]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCategories.filter((cat) => {
      if (filterUnit !== 'all' && cat.unit !== filterUnit) return false;
      if (q && !cat.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeCategories, filterUnit, search]);

  const cartLines = useMemo(() => {
    const lines: Array<{
      categoryId: number;
      category: Category;
      unit: 'kilo' | 'half_kilo' | 'box' | 'piece';
      quantity: number;
      unitPrice: number;
      subtotal: number;
      key: string;
    }> = [];
    for (const [key, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const [idStr, unit] = key.split(':') as [string, 'kilo' | 'half_kilo' | 'box' | 'piece'];
      const cat = activeCategories.find((c) => c.id === Number(idStr));
      if (!cat) continue;
      const unitPrice =
        unit === 'half_kilo'
          ? (cat.halfKiloPrice && cat.halfKiloPrice > 0 ? cat.halfKiloPrice : Math.round(cat.pricePerUnit / 2))
          : cat.pricePerUnit;
      lines.push({
        categoryId: cat.id,
        category: cat,
        unit,
        quantity: qty,
        unitPrice,
        subtotal: qty * unitPrice,
        key,
      });
    }
    return lines;
  }, [cart, activeCategories]);

  const totalPrice = useMemo(() => cartLines.reduce((sum, line) => sum + line.subtotal, 0), [cartLines]);
  const totalItemsCount = useMemo(() => cartLines.reduce((sum, line) => sum + line.quantity, 0), [cartLines]);

  const numReceived = parseFloat(receivedCash) || 0;
  const changeDue = Math.max(0, numReceived - totalPrice);

  const add = (id: number, unit: string, delta: number) => {
    const key = `${id}:${unit}`;
    setCart((curr) => {
      const next = Math.max(0, (curr[key] || 0) + delta);
      if (next === 0) {
        const nextMap = { ...curr };
        delete nextMap[key];
        return nextMap;
      }
      return { ...curr, [key]: next };
    });
  };

  const removeLine = (key: string) => {
    setCart((curr) => {
      const nextMap = { ...curr };
      delete nextMap[key];
      return nextMap;
    });
  };

  const clearTicket = () => {
    setCart({});
    setReceivedCash('');
  };

  const handleCheckout = async () => {
    if (cartLines.length === 0 || createOrder.isPending) return;
    const finalPhone = customerPhone.trim() || '01000000000';
    const todayStr = getTodayCairo();

    try {
      const orderNotes = notes.trim()
        ? notes.trim()
        : paymentMethod === 'cash' && numReceived > totalPrice
        ? `كاشير مباشر - مستلم: ${numReceived} ج - باقي: ${changeDue} ج`
        : 'طلب كاشير مباشر';

      const result = await createOrder.mutateAsync({
        data: {
          customerName: 'عميل مباشر',
          phoneNumber: finalPhone,
          pickupDate: todayStr,
          pickupTime: 'استلام فوري (كاشير)',
          paymentMethod,
          paymentStatus: 'paid',
          depositAmount: totalPrice,
          createdBy: 'admin',
          status: 'delivered',
          notes: orderNotes,
          items: cartLines.map((line) => ({
            categoryId: line.categoryId,
            quantity: line.quantity,
            unit: line.unit,
          })),
        },
      });

      playOrderChime();
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardAnalyticsQueryKey() });

      setLastCompletedOrder(result);
      setPrintingOrder(result);
      setCart({});
      setReceivedCash('');
      setTimeout(() => {
        window.print();
      }, 100);
    } catch {
      alert(language === 'ar' ? 'تعذر إتمام الطلب الفوري. يرجى التحقق من توفر المخزون.' : 'Failed to complete quick order. Please check stock availability.');
    }
  };

  const getUnitBadge = (unit: string) => {
    if (unit === 'half_kilo') return language === 'ar' ? '½ كجم' : '0.5 kg';
    if (unit === 'kilo') return language === 'ar' ? 'كجم' : '1 kg';
    if (unit === 'box') return language === 'ar' ? 'علبة' : 'Box';
    if (unit === 'piece') return language === 'ar' ? 'قطعة' : 'Pc';
    return unit;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-sm overflow-hidden" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col h-[94vh] max-h-[880px] w-full max-w-6xl rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Zap size={20} className="fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg sm:text-xl font-bold">{t('quickPosTitle')}</h2>
                <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 text-[10px] font-bold">
                  {language === 'ar' ? 'تسليم فوري ومباشر' : 'Instant Counter Checkout'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t('quickPosSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="button-close-pos-modal"
            onClick={onClose}
            className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] flex-1 overflow-hidden divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-border">
          
          {/* Menu Catalog Section */}
          <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Search & Filter Toolbar */}
            <div className="p-3 border-b border-border flex flex-wrap items-center gap-2 bg-card">
              <div className="relative flex-1 min-w-[160px]">
                <Search size={15} className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  data-testid="pos-search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchSweets')}
                  className="w-full rounded-xl bg-muted py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Unit Filter Chips */}
              <div className="flex items-center gap-1 overflow-x-auto">
                {(['all', 'kilo', 'box', 'piece'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setFilterUnit(u)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
                      filterUnit === u
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {u === 'all'
                      ? t('allCategories')
                      : u === 'kilo'
                      ? (language === 'ar' ? 'كيلو (وزن)' : 'Kilo')
                      : u === 'box'
                      ? (language === 'ar' ? 'علب' : 'Boxes')
                      : (language === 'ar' ? 'قطع' : 'Pieces')}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              {filteredCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Package size={36} className="text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-semibold">{t('noOrdersView')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredCategories.map((cat) => {
                    const isKilo = cat.unit === 'kilo';
                    const isSoldOut = isKilo
                      ? (cat.stockQuantity <= 0 && (!cat.halfKiloStock || cat.halfKiloStock <= 0))
                      : cat.stockQuantity <= 0;

                    return (
                      <div
                        key={cat.id}
                        data-testid={`pos-category-card-${cat.id}`}
                        className={`group relative flex flex-col justify-between rounded-2xl border bg-card p-2.5 shadow-xs transition-all hover:border-primary/40 ${
                          isSoldOut ? 'border-destructive/30 bg-destructive/5 opacity-80' : 'border-border'
                        }`}
                      >
                        <div>
                          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                            <img
                              src={cat.imageUrl || getCategoryFallbackImage(cat.name)}
                              alt={cat.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                            {isSoldOut && (
                              <span className="absolute inset-x-0 bottom-0 bg-destructive/90 text-destructive-foreground text-[10px] font-bold text-center py-0.5">
                                {t('soldOut')}
                              </span>
                            )}
                          </div>
                          <h4 className="mt-2 text-xs font-bold text-foreground line-clamp-1" title={cat.name}>
                            {cat.name}
                          </h4>
                          <div className="mt-1 flex items-center justify-between text-[11px]">
                            <span className="font-mono-ui font-bold text-primary">
                              {money.format(cat.pricePerUnit)}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {isKilo
                                ? `${cat.stockQuantity} كجم`
                                : `${cat.stockQuantity} ${getUnitBadge(cat.unit)}`}
                            </span>
                          </div>
                        </div>

                        {/* Quick Add Buttons */}
                        {isKilo ? (
                          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              data-testid={`pos-add-kilo-${cat.id}`}
                              onClick={() => add(cat.id, 'kilo', 1)}
                              className="flex items-center justify-center gap-1 rounded-xl bg-primary/10 hover:bg-primary hover:text-primary-foreground py-1.5 text-[11px] font-bold text-primary transition-all active:scale-95"
                              title={t('quickAddKilo')}
                            >
                              <Plus size={12} />
                              <span>{t('quickAddKilo')}</span>
                            </button>
                            <button
                              type="button"
                              data-testid={`pos-add-half-kilo-${cat.id}`}
                              onClick={() => add(cat.id, 'half_kilo', 1)}
                              className="flex items-center justify-center gap-1 rounded-xl bg-muted hover:bg-primary hover:text-primary-foreground py-1.5 text-[11px] font-bold text-foreground transition-all active:scale-95"
                              title={t('quickAddHalfKilo')}
                            >
                              <Plus size={12} />
                              <span>{t('quickAddHalfKilo')}</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            data-testid={`pos-add-${cat.unit}-${cat.id}`}
                            onClick={() => add(cat.id, cat.unit, 1)}
                            className="mt-2.5 flex items-center justify-center gap-1 rounded-xl bg-primary/10 hover:bg-primary hover:text-primary-foreground py-1.5 text-[11px] font-bold text-primary transition-all active:scale-95"
                          >
                            <Plus size={12} />
                            <span>{cat.unit === 'box' ? t('quickAddBox') : t('quickAddPiece')}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Ticket & Checkout Section */}
          <div className="flex flex-col h-full overflow-hidden bg-card/60">
            {lastCompletedOrder ? (
              /* Success Panel */
              <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in duration-200">
                <div className="grid size-16 place-items-center rounded-3xl bg-emerald-500/15 text-emerald-600 mb-4">
                  <Check size={32} />
                </div>
                <h3 className="font-display text-2xl font-bold text-foreground">
                  {t('orderCompletedSuccessfully')}
                </h3>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="font-mono text-lg font-black text-primary bg-primary/10 px-4 py-1.5 rounded-full shadow-xs">
                    #{lastCompletedOrder.orderNumber}
                  </span>
                  {lastCompletedOrder.orderNumber.includes('-') && (
                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2.5 py-1 rounded-full border border-amber-500/20">
                      {language === 'ar'
                        ? `دورة ${lastCompletedOrder.orderNumber.split('-')[1]}`
                        : `Cycle ${lastCompletedOrder.orderNumber.split('-')[1]}`}
                    </span>
                  )}
                </div>
                <div className="mt-4 w-full max-w-sm rounded-2xl border border-border bg-card p-4 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('customer')}:</span>
                    <strong className="text-foreground">{lastCompletedOrder.customerName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('receiptPhone')}:</span>
                    <strong dir="ltr" className="font-mono">{lastCompletedOrder.phoneNumber}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('paymentMethod')}:</span>
                    <strong>{lastCompletedOrder.paymentMethod || 'cash'}</strong>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-sm">
                    <span className="font-bold">{t('grandTotal')}:</span>
                    <strong className="font-mono text-primary font-bold">{money.format(lastCompletedOrder.totalPrice)}</strong>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    data-testid="pos-reprint-btn"
                    onClick={() => {
                      setPrintingOrder(lastCompletedOrder);
                      setTimeout(() => window.print(), 100);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted/80 transition-all"
                  >
                    <Printer size={15} />
                    <span>{t('reprintReceipt')}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="pos-new-order-btn"
                    onClick={() => {
                      setLastCompletedOrder(null);
                      setPrintingOrder(null);
                      setCustomerPhone('');
                      setReceivedCash('');
                      setNotes('');
                      setCart({});
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
                  >
                    <Plus size={15} />
                    <span>{t('newQuickOrder')}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Active Order Ticket */
              <div className="flex flex-col h-full overflow-hidden">
                {/* Ticket Header */}
                <div className="p-3.5 border-b border-border flex items-center justify-between bg-card shrink-0">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={16} className="text-primary" />
                    <span className="font-bold text-xs">{t('ticketItems')}</span>
                    {totalItemsCount > 0 && (
                      <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-bold">
                        {totalItemsCount}
                      </span>
                    )}
                  </div>
                  {cartLines.length > 0 && (
                    <button
                      type="button"
                      data-testid="pos-clear-ticket-btn"
                      onClick={clearTicket}
                      className="text-[11px] font-bold text-destructive hover:underline flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      <span>{t('clearTicket')}</span>
                    </button>
                  )}
                </div>

                {/* Items List (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {cartLines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground p-4">
                      <ShoppingBag size={32} className="text-muted-foreground/30 mb-2" />
                      <p className="text-xs font-semibold max-w-[200px] leading-relaxed">
                        {t('emptyTicket')}
                      </p>
                    </div>
                  ) : (
                    cartLines.map((line) => (
                      <div
                        key={line.key}
                        data-testid={`pos-cart-line-${line.key}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card p-2 text-xs shadow-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-foreground truncate">{line.category.name}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                            <span className="rounded-md bg-muted px-1.5 py-0.5 font-bold">
                              {getUnitBadge(line.unit)}
                            </span>
                            <span>×</span>
                            <span className="font-mono">{money.format(line.unitPrice)}</span>
                          </div>
                        </div>

                        {/* Stepper */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => add(line.categoryId, line.unit, -1)}
                            className="size-6 grid place-items-center rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground transition-all active:scale-95"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="min-w-[20px] text-center font-mono font-bold text-xs">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => add(line.categoryId, line.unit, 1)}
                            className="size-6 grid place-items-center rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground transition-all active:scale-95"
                          >
                            <Plus size={11} />
                          </button>
                        </div>

                        {/* Subtotal & Delete */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-xs text-foreground min-w-[55px] text-left rtl:text-right">
                            {money.format(line.subtotal)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            className="text-muted-foreground hover:text-destructive p-1 rounded-md transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Controls & Checkout */}
                <div className="border-t border-border bg-card p-3.5 space-y-3 shrink-0">
                  {/* Total Display */}
                  <div className="flex items-baseline justify-between border-b border-border pb-2.5">
                    <span className="text-xs font-bold text-muted-foreground">{t('grandTotal')}:</span>
                    <span className="font-mono text-xl sm:text-2xl font-bold text-primary">
                      {money.format(totalPrice)}
                    </span>
                  </div>

                  {/* Customer Phone & Shortcut */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-muted-foreground">
                        {t('enterPhoneForTicket')}
                      </label>
                      <button
                        type="button"
                        onClick={() => setCustomerPhone('01000000000')}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        {t('useCounterPhone')}
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="tel"
                        data-testid="pos-phone-input"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="01000000000"
                        className="flex-1 rounded-xl bg-muted px-3 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>

                  {/* Payment Method Pills */}
                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                      {t('paymentMethod')}:
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'cash', label: language === 'ar' ? 'كاش' : 'Cash', icon: Wallet },
                          { id: 'instapay', label: 'InstaPay', icon: DollarSign },
                          { id: 'card', label: language === 'ar' ? 'فيزا' : 'Card', icon: CreditCard },
                          { id: 'vodafone_cash', label: 'V.Cash', icon: Phone },
                        ] as const
                      ).map((pm) => {
                        const Icon = pm.icon;
                        const isSelected = paymentMethod === pm.id;
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => setPaymentMethod(pm.id)}
                            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border text-[10px] font-bold transition-all ${
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                                : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            <Icon size={12} className="mb-0.5" />
                            <span>{pm.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cash Calculator (if cash) */}
                  {paymentMethod === 'cash' && (
                    <div className="rounded-xl border border-border/70 bg-muted/30 p-2 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">{t('amountReceived')}:</span>
                        <input
                          type="number"
                          data-testid="pos-cash-received-input"
                          value={receivedCash}
                          onChange={(e) => setReceivedCash(e.target.value)}
                          placeholder={String(totalPrice)}
                          className="w-24 rounded-lg bg-card border border-border px-2 py-1 text-xs font-mono text-right outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setReceivedCash(String(totalPrice))}
                            className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold hover:bg-muted/80"
                          >
                            {t('exactAmount')}
                          </button>
                          {[200, 500, 1000].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setReceivedCash(String(amt))}
                              className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold hover:bg-muted/80 font-mono"
                            >
                              {amt}
                            </button>
                          ))}
                        </div>
                        {numReceived >= totalPrice && numReceived > 0 && (
                          <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <span>{t('changeDue')}: </span>
                            <span className="font-mono">{money.format(changeDue)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Checkout & Print Button */}
                  <button
                    type="button"
                    data-testid="pos-checkout-btn"
                    onClick={handleCheckout}
                    disabled={cartLines.length === 0 || createOrder.isPending}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {createOrder.isPending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>{t('sendingRequest')}</span>
                      </>
                    ) : (
                      <>
                        <Printer size={16} />
                        <span>{t('fulfillAndPrint')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden Portal for Print */}
      {printingOrder && <PrintableReceipt order={printingOrder} />}
    </div>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [hijriSettingsOpen, setHijriSettingsOpen] = useState(false);
  const [quickPosOpen, setQuickPosOpen] = useState(false);
  const [sightingOffset] = useHijriOffset();
  const { signOut } = useUnifiedAuth();
  const { t, language } = useLanguage();
  const access = useStaffAccess();
  const isOwner = access.role === 'owner';
  const canOrder = hasPermission(access, 'orders');

  useEffect(() => {
    const handler = () => setQuickPosOpen(true);
    window.addEventListener('open-quick-pos', handler);
    return () => window.removeEventListener('open-quick-pos', handler);
  }, []);

  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('order_sound_enabled') !== 'false');
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('order_sound_enabled', String(next));
    if (next) playOrderChime();
  };

  const links = [
    { href: '/admin', label: t('overview'), icon: BarChart3, visible: hasPermission(access, 'analytics') },
    { href: '/admin/orders', label: t('orders'), icon: ClipboardList, visible: hasPermission(access, 'orders') },
    { href: '/admin/stock-demand', label: t('stockDemand'), icon: Scale, visible: hasPermission(access, 'inventory') || hasPermission(access, 'orders') },
    { href: '/admin/kitchen', label: language === 'ar' ? 'تشغيل المعمل' : 'Kitchen Sheet', icon: ChefHat, visible: hasPermission(access, 'orders') },
    { href: '/admin/categories', label: t('categoriesStock'), icon: Package, visible: hasPermission(access, 'inventory') },
    { href: '/admin/analytics', label: t('analytics'), icon: TrendingUp, visible: hasPermission(access, 'analytics') },
    { href: '/admin/team', label: t('team'), icon: Users, visible: hasPermission(access, 'team') },
  ].filter((link) => link.visible);
  return <div className="min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 w-[264px] -translate-x-full bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : ''}`}>
      <div className="flex items-center justify-between"><Logo light /><button data-testid="button-close-sidebar" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-sidebar-foreground/70 md:hidden"><X size={18} /></button></div>
       <div className="mt-12 space-y-1">
         <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/45">{t('workspace')}</p>
         {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-${href.replace('/admin/', '').replace('/admin', 'overview')}`} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${location === href ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}><Icon size={18} /><span>{label}</span>{href === '/admin/orders' && <span className="ml-auto rounded-full bg-[hsl(9_54%_63%)] px-1.5 py-0.5 text-[10px] text-white">{t('live')}</span>}</Link>)}
      </div>
       <div className="absolute bottom-6 left-5 right-5 rounded-2xl border border-sidebar-border bg-sidebar-accent p-4"><div className="flex items-center gap-2 text-sidebar-primary"><ShieldCheck size={16} /><span className="text-xs font-bold">{t('pickupDesk')}</span></div><p className="mt-2 text-xs leading-5 text-sidebar-foreground/60">{t('ordersTidy')}</p><Link href="/" data-testid="link-view-shop" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sidebar-primary">{t('viewShop')} <ArrowRight size={13} /></Link></div>
    </aside>
    {mobileOpen && <button data-testid="button-sidebar-overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[hsl(164_31%_18%/0.35)] md:hidden" aria-label="إغلاق القائمة" />}
    <div className="md:pl-[264px]">
       <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:px-8">
         <div className="flex items-center gap-3">
           <button data-testid="button-open-sidebar" onClick={() => setMobileOpen(true)} className="rounded-xl border border-border p-2 md:hidden"><Menu size={19} /></button>
           <div className="hidden md:block">
             <p className="font-display text-lg">{t('goodMorning')}</p>
             <p className="text-xs text-muted-foreground">{t('calmerEid')}</p>
           </div>
         </div>
         <div className="flex items-center gap-2 sm:gap-3">
           {canOrder && (
             <button
               type="button"
               data-testid="button-open-quick-pos"
               onClick={() => setQuickPosOpen(true)}
               title={language === 'ar' ? 'طلب فوري لكاشير المحل (بيع مباشر)' : 'Quick Order (Counter POS)'}
               className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95"
             >
               <Zap size={14} className="fill-current text-primary-foreground" />
               <span>{t('quickPosOrder')}</span>
             </button>
           )}
           <button
             type="button"
             data-testid="button-hijri-settings"
             onClick={() => setHijriSettingsOpen(true)}
             title={language === 'ar' ? 'ضبط رؤية هلال العيد والتقويم الهجري' : 'Adjust Moon Sighting & Hijri'}
             className="relative inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
           >
             <Moon size={15} className="text-[hsl(38_74%_63%)]" />
             <span className="hidden sm:inline">{language === 'ar' ? 'رؤية الهلال' : 'Crescent'}</span>
             {sightingOffset !== 0 && (
               <span className="rounded-full bg-primary/20 px-1 text-[10px] text-primary font-mono">
                 {sightingOffset > 0 ? `+${sightingOffset}` : sightingOffset}
               </span>
             )}
           </button>
           {isOwner && (
             <button
               data-testid="button-change-password-header"
               onClick={() => setChangePasswordOpen(true)}
               title={language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
               className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
             >
               <KeyRound size={14} className="text-[hsl(38_74%_63%)]" />
               <span className="hidden sm:inline">{language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}</span>
             </button>
           )}
           <Link href="/track" data-testid="link-track-public" className="hidden items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted sm:flex"><ExternalLink size={14} /> {t('publicTracker')}</Link>
           <LanguageToggle />
           <button
             type="button"
             data-testid="button-toggle-sound"
             onClick={toggleSound}
             title={soundEnabled ? (language === 'ar' ? 'كتم تنبيه الطلبات الجديدة' : 'Mute new order alert') : (language === 'ar' ? 'تشغيل صوت تنبيه الطلبات' : 'Enable new order sound alert')}
             className="relative rounded-xl border border-border p-2.5 text-muted-foreground hover:bg-muted"
           >
             {soundEnabled ? <Volume2 size={17} className="text-primary" /> : <VolumeX size={17} />}
           </button>
           <button data-testid="button-notifications" className="relative rounded-xl border border-border p-2.5 text-muted-foreground hover:bg-muted"><Bell size={17} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[hsl(9_54%_63%)]" /></button>
           <div className={`grid size-9 place-items-center rounded-full text-xs font-bold ${isOwner ? 'bg-[hsl(38_74%_63%/0.25)] text-[hsl(34_65%_35%)]' : 'bg-secondary'}`}>
             {isOwner ? <Crown size={15} /> : 'AM'}
           </div>
           <button data-testid="button-admin-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">{t('signOut')}</button>
         </div>
       </header>
      <main className="p-4 md:p-8">{children}</main>
      <ChangePasswordDialog isOpen={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
      <HijriSettingsDialog isOpen={hijriSettingsOpen} onClose={() => setHijriSettingsOpen(false)} />
      <QuickOrderPosModal isOpen={quickPosOpen} onClose={() => setQuickPosOpen(false)} />
    </div>
  </div>;
}

function PublicHeader() {
  const { t } = useLanguage();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/40 bg-background/90 px-3.5 py-2.5 backdrop-blur-md sm:px-6 sm:py-4 md:px-10">
      <Link href="/" data-testid="link-home-logo" className="shrink-0">
        <Logo />
      </Link>
      <nav className="flex items-center gap-1.5 sm:gap-2.5">
        <Link
          href="/track"
          data-testid="link-track-order"
          className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground sm:px-3 sm:py-2 sm:text-sm"
          title={t('trackOrder')}
        >
          <ClipboardList size={14} className="shrink-0" />
          <span className="hidden sm:inline">{t('trackOrder')}</span>
        </Link>
        <Link
          href="/admin/login"
          data-testid="link-staff-login"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground shadow-xs hover:bg-muted transition-colors sm:px-3 sm:py-2 sm:text-sm"
          title={t('staffSignIn')}
        >
          <KeyRound size={13} className="text-[hsl(38_74%_63%)] shrink-0" />
          <span>{t('staffSignIn')}</span>
        </Link>
        <LanguageToggle />
      </nav>
    </header>
  );
}

function getCairoDateInfo(offsetDays = 0, sightingOffset = getStoredSightingOffset()) {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(now);

    const year = parseInt(parts.find((p) => p.type === 'year')?.value || `${now.getFullYear()}`, 10);
    const month = parseInt(parts.find((p) => p.type === 'month')?.value || `${now.getMonth() + 1}`, 10) - 1;
    const day = parseInt(parts.find((p) => p.type === 'day')?.value || `${now.getDate()}`, 10);

    const target = new Date(year, month, day + offsetDays);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;

    const dayNameAr = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(target);
    const dayNameEn = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(target);
    const formattedAr = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(target);
    const formattedEn = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(target);

    const hijri = getHijriDateInfo(target, sightingOffset);

    return {
      iso,
      dayNameAr,
      dayNameEn,
      formattedAr,
      formattedEn,
      hijriDayValAr: hijri.dayValAr,
      hijriMonthValAr: hijri.monthValAr,
      hijriFormattedAr: hijri.formattedAr,
      hijriFormattedFullAr: hijri.formattedFullAr,
      hijriFormattedEn: hijri.formattedEn,
      hijriFormattedFullEn: hijri.formattedFullEn,
    };
  } catch {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const iso = d.toISOString().slice(0, 10);
    const hijri = getHijriDateInfo(d, sightingOffset);
    return {
      iso,
      dayNameAr: '',
      dayNameEn: '',
      formattedAr: iso,
      formattedEn: iso,
      hijriDayValAr: hijri.dayValAr,
      hijriMonthValAr: hijri.monthValAr,
      hijriFormattedAr: hijri.formattedAr,
      hijriFormattedFullAr: hijri.formattedFullAr,
      hijriFormattedEn: hijri.formattedEn,
      hijriFormattedFullEn: hijri.formattedFullEn,
    };
  }
}

function formatPickupTimeSlot(time: string, lang: 'ar' | 'en'): string {
  if (!time) return '';
  if (time.includes('كاشير') || time.includes('POS') || time.toLowerCase().includes('instant')) {
    return lang === 'en' ? 'Instant Pickup (POS)' : 'استلام فوري (كاشير)';
  }
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return time;
  const m = parts[1] || '00';
  const isPM = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const padH = String(h12).padStart(2, '0');
  if (lang === 'ar') {
    return `${padH}:${m} ${isPM ? 'م' : 'ص'}`;
  }
  return `${padH}:${m} ${isPM ? 'PM' : 'AM'}`;
}

const PICKUP_TIME_SLOTS = [
  { time: '10:00', period: 'morning', labelAr: '10:00 ص', labelEn: '10:00 AM' },
  { time: '11:00', period: 'morning', labelAr: '11:00 ص', labelEn: '11:00 AM' },
  { time: '12:00', period: 'morning', labelAr: '12:00 م', labelEn: '12:00 PM' },
  { time: '13:00', period: 'afternoon', labelAr: '01:00 م', labelEn: '01:00 PM' },
  { time: '14:00', period: 'afternoon', labelAr: '02:00 م', labelEn: '02:00 PM' },
  { time: '15:00', period: 'afternoon', labelAr: '03:00 م', labelEn: '03:00 PM' },
  { time: '16:00', period: 'afternoon', labelAr: '04:00 م', labelEn: '04:00 PM' },
  { time: '17:00', period: 'evening', labelAr: '05:00 م', labelEn: '05:00 PM' },
  { time: '18:00', period: 'evening', labelAr: '06:00 م', labelEn: '06:00 PM' },
  { time: '19:00', period: 'evening', labelAr: '07:00 م', labelEn: '07:00 PM' },
  { time: '20:00', period: 'evening', labelAr: '08:00 م', labelEn: '08:00 PM' },
  { time: '21:00', period: 'evening', labelAr: '09:00 م', labelEn: '09:00 PM' },
  { time: '22:00', period: 'evening', labelAr: '10:00 م', labelEn: '10:00 PM' },
] as const;

function HomePage() {
  const { t, language } = useLanguage();
  const categoriesQuery = useListCategories();
  const createOrder = useCreateOrder();
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('eid-sweets-cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('eid-sweets-cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);
  const [step, setStep] = useState<'shop' | 'details' | 'success'>('shop');
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState(() => ({
    name: '',
    phone: '',
    date: getCairoDateInfo(0).iso,
    time: '11:00',
    notes: '',
  }));
  const activeCategories = Array.isArray(categoriesQuery.data)
    ? categoriesQuery.data.filter((category) => category.isActive !== false)
    : [];

  const cartLines = useMemo(() => {
    const lines: Array<{
      category: Category;
      unit: 'kilo' | 'half_kilo' | 'box' | 'piece';
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      key: string;
    }> = [];
    for (const [key, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const [idStr, unit] = key.split(':') as [string, 'kilo' | 'half_kilo' | 'box' | 'piece'];
      const cat = activeCategories.find((c) => c.id === Number(idStr));
      if (!cat) continue;
      const unitPrice =
        unit === 'half_kilo'
          ? (cat.halfKiloPrice && cat.halfKiloPrice > 0 ? cat.halfKiloPrice : Math.round(cat.pricePerUnit / 2))
          : cat.pricePerUnit;
      lines.push({
        category: cat,
        unit,
        quantity: qty,
        unitPrice,
        lineTotal: qty * unitPrice,
        key,
      });
    }
    return lines;
  }, [cart, activeCategories]);

  const total = useMemo(() => cartLines.reduce((sum, line) => sum + line.lineTotal, 0), [cartLines]);

  const orderPayload = {
    customerName: customer.name,
    phoneNumber: customer.phone,
    pickupDate: customer.date,
    pickupTime: customer.time,
    notes: customer.notes || undefined,
    createdBy: 'guest' as const,
    items: cartLines.map((line) => ({
      categoryId: line.category.id,
      unit: line.unit,
      quantity: line.quantity,
    })),
  };

  const add = (id: number, unit: string, amount: number) => {
    const key = `${id}:${unit}`;
    setCart((current) => {
      const next = Math.max(0, (current[key] || 0) + amount);
      if (next === 0) {
        const copy = { ...current };
        delete copy[key];
        return copy;
      }
      return { ...current, [key]: next };
    });
  };

  const resetOrder = () => {
    setCart({});
    setCustomer({ name: '', phone: '', date: getCairoDateInfo(0).iso, time: '11:00', notes: '' });
    setCompletedOrder(null);
    setStep('shop');
  };
  const submit = () => createOrder.mutate({ data: orderPayload }, { onSuccess: (order) => { setCompletedOrder(order); setStep('success'); } });
  return (
    <div className="min-h-[100dvh] bg-background surface-grid w-full overflow-x-hidden">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-3.5 pb-20 sm:px-6 md:px-10">
        {step === 'shop' && (
          <>
            <section className="grid items-end gap-8 pb-10 pt-8 sm:gap-10 sm:pb-14 sm:pt-12 md:grid-cols-[1.15fr_.85fr] md:pt-20">
              <div className="animate-rise">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[hsl(38_74%_63%/0.5)] bg-[hsl(38_74%_63%/0.15)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em]">
                  <Sparkles size={13} /> {t('eidTable')}
                </div>
                <h1 className="max-w-2xl font-display text-3xl leading-[1.08] tracking-tight sm:text-5xl sm:leading-[0.98] sm:tracking-[-0.04em] md:text-7xl text-[hsl(164_31%_18%)]">
                  {t('heroTitle')}<br /><span className="text-[hsl(9_54%_55%)]">{t('heroAccent')}</span>
                </h1>
                <p className="mt-4 sm:mt-6 max-w-lg text-sm sm:text-base leading-6 sm:leading-7 text-muted-foreground">
                  {t('heroDescription')}
                </p>
                <div className="mt-6 sm:mt-8 flex flex-wrap gap-2.5 sm:gap-3 text-xs sm:text-sm font-semibold">
                  <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-xs border border-border/50">
                    <Clock3 size={15} className="text-[hsl(9_54%_63%)] shrink-0" /> {t('sameDayPickup')}
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-xs border border-border/50">
                    <ShieldCheck size={15} className="text-[hsl(153_28%_48%)] shrink-0" /> {t('noOnlinePayment')}
                  </div>
                </div>
              </div>
              <div className="relative isolate flex flex-col justify-between overflow-hidden rounded-[24px] sm:rounded-[28px] bg-[hsl(164_31%_18%)] p-6 sm:p-7 text-[hsl(39_45%_94%)] warm-shadow md:min-h-[280px]">
                <div className="absolute -right-12 -top-16 size-48 rounded-full border-[22px] border-[hsl(38_74%_63%/0.25)] pointer-events-none" />
                <div className="absolute -bottom-24 -left-8 size-48 rounded-full border-[30px] border-[hsl(9_54%_63%/0.18)] pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-[hsl(38_74%_63%)]">{t('thisWeek')}</p>
                    <span className="relative flex items-center gap-1.5 rounded-full bg-[hsl(38_74%_63%/0.15)] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(38_74%_63%)]">
                      <Sparkles size={12} />
                      {language === 'ar' ? 'موسم العيد' : 'Eid Season'}
                    </span>
                  </div>
                  <h3 className="relative mt-3.5 font-display text-xl sm:text-2xl font-bold leading-snug text-[hsl(39_45%_94%)]">
                    {t('testimonial')}
                  </h3>
                  <div className="relative mt-4 space-y-2.5 text-xs sm:text-sm text-[hsl(39_25%_88%)]">
                    <div className="flex items-center gap-2.5">
                      <Clock3 size={15} className="shrink-0 text-[hsl(38_74%_63%)]" />
                      <span>{t('storeInfoHours')}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <MapPin size={15} className="shrink-0 text-[hsl(38_74%_63%)]" />
                      <span>{t('storeInfoLocation')}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Package size={15} className="shrink-0 text-[hsl(38_74%_63%)]" />
                      <span>{t('storeInfoPacking')}</span>
                    </div>
                  </div>
                </div>
                <div className="relative mt-5 border-t border-[hsl(39_45%_94%/0.15)] pt-3 text-[11px] sm:text-xs text-[hsl(38_74%_63%)] font-semibold">
                  {t('storeInfoFooter')}
                </div>
              </div>
            </section>

            <section className="grid gap-5 md:grid-cols-[1fr_340px]">
              <div>
                <div className="mb-5 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">{t('sweetShelf')}</p>
                    <h2 className="mt-1 font-display text-2xl sm:text-3xl">{t('buildBox')}</h2>
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground">{cartLines.length} {t('selections')}</span>
                </div>
                {categoriesQuery.isLoading ? (
                  <PageLoader />
                ) : categoriesQuery.isError ? (
                  <QueryError retry={() => categoriesQuery.refetch()} />
                ) : activeCategories.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
                    {language === 'ar' ? 'الرف بيتجهز. ارجع لنا قريب.' : 'The shelf is being restocked. Please check back shortly.'}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {activeCategories.map((category, index) => {
                      const sweetImg = category.imageUrl || getCategoryFallbackImage(category.name);
                      const isKiloCategory = category.unit === 'kilo';
                      return (
                        <div
                          key={category.id}
                          data-testid={`card-category-${category.id}`}
                          className="group lift flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all hover:shadow-md"
                          style={{ animationDelay: `${index * 60}ms` }}
                        >
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                            <img
                              src={sweetImg}
                              alt={category.name}
                              loading="lazy"
                              onError={(e) => {
                                const target = e.currentTarget;
                                const fallback = getCategoryFallbackImage(category.name);
                                if (target.src !== fallback) {
                                  target.src = fallback;
                                }
                              }}
                              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                            <div className="absolute top-3 start-3 z-10">
                              <span className="inline-flex items-center rounded-lg bg-[hsl(164_31%_18%/0.9)] px-2.5 py-1 text-xs font-bold text-[hsl(38_74%_63%)] shadow-md backdrop-blur-sm border border-[hsl(38_74%_63%/0.35)]">
                                {isKiloCategory
                                  ? (language === 'ar' ? 'كيلو / نصف كيلو' : 'kg / 0.5 kg')
                                  : getUnitLabel(category.unit, language)}
                              </span>
                            </div>
                            <div className="absolute bottom-3 start-3 end-3 flex items-end justify-between text-white">
                              <div className="min-w-0 pr-2">
                                <h3 className="font-display text-base sm:text-lg font-bold tracking-tight drop-shadow truncate">{category.name}</h3>
                                <p className="text-xs font-medium text-white/90 drop-shadow">
                                  {isKiloCategory ? (
                                    <>
                                      {money.format(category.pricePerUnit)} / {t('kiloUnit')} · {money.format(category.halfKiloPrice || Math.round(category.pricePerUnit / 2))} / {t('halfKiloUnit')}
                                    </>
                                  ) : (
                                    <>
                                      {money.format(category.pricePerUnit)} / {getUnitLabel(category.unit, language)}
                                    </>
                                  )}
                                </p>
                              </div>
                              <div className="grid size-8 place-items-center rounded-lg bg-black/30 backdrop-blur-sm text-white shrink-0">
                                <ShoppingBag size={15} />
                              </div>
                            </div>
                          </div>
                          <div className="p-3.5 sm:p-4 flex flex-col justify-between flex-1 gap-2.5">
                            {isKiloCategory ? (
                              <div className="space-y-2.5 w-full">
                                {/* 1 Kilo Option */}
                                {(() => {
                                  const availKilo = category.availableStock !== undefined ? category.availableStock : category.stockQuantity;
                                  const isLowKilo = availKilo <= (category.lowStockThreshold || 0);
                                  const currentKiloQty = cart[`${category.id}:kilo`] || 0;
                                  return (
                                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-muted/40 border border-border/50">
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-bold text-foreground">{t('kiloUnit')}</span>
                                          <span className="text-[11px] font-mono text-muted-foreground">({money.format(category.pricePerUnit)})</span>
                                        </div>
                                        <span className={`block text-[11px] ${isLowKilo ? 'font-bold text-[hsl(3_58%_48%)]' : 'text-muted-foreground'}`}>
                                          {availKilo > 0 ? `${availKilo} ${t('kiloUnit')} ${t('left')}` : t('soldOutKilo')}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        {currentKiloQty > 0 ? (
                                          <>
                                            <button
                                              data-testid={`button-decrease-${category.id}-kilo`}
                                              onClick={() => add(category.id, 'kilo', -1)}
                                              className="grid size-7 place-items-center rounded-lg border border-border font-bold hover:bg-muted transition-colors text-sm"
                                            >
                                              −
                                            </button>
                                            <span data-testid={`text-quantity-${category.id}-kilo`} className="w-5 text-center text-xs font-bold">
                                              {currentKiloQty}
                                            </span>
                                          </>
                                        ) : null}
                                        <button
                                          data-testid={`button-add-${category.id}-kilo`}
                                          disabled={availKilo <= 0 || currentKiloQty >= availKilo}
                                          onClick={() => add(category.id, 'kilo', 1)}
                                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                          {currentKiloQty > 0 ? <Plus size={14} /> : t('addKilo')}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Half Kilo Option */}
                                {(() => {
                                  const halfPrice = category.halfKiloPrice && category.halfKiloPrice > 0 ? category.halfKiloPrice : Math.round(category.pricePerUnit / 2);
                                  const availHalf = category.availableHalfKiloStock !== undefined ? category.availableHalfKiloStock : (category.halfKiloStock ?? 0);
                                  const halfThreshold = category.halfKiloThreshold ?? 5;
                                  const isLowHalf = availHalf <= halfThreshold;
                                  const currentHalfQty = cart[`${category.id}:half_kilo`] || 0;
                                  return (
                                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-muted/40 border border-border/50">
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs font-bold text-foreground">{t('halfKiloUnit')}</span>
                                          <span className="text-[11px] font-mono text-muted-foreground">({money.format(halfPrice)})</span>
                                        </div>
                                        <span className={`block text-[11px] ${isLowHalf ? 'font-bold text-[hsl(3_58%_48%)]' : 'text-muted-foreground'}`}>
                                          {availHalf > 0 ? `${availHalf} ${t('halfKiloUnit')} ${t('left')}` : t('soldOutHalfKilo')}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        {currentHalfQty > 0 ? (
                                          <>
                                            <button
                                              data-testid={`button-decrease-${category.id}-half`}
                                              onClick={() => add(category.id, 'half_kilo', -1)}
                                              className="grid size-7 place-items-center rounded-lg border border-border font-bold hover:bg-muted transition-colors text-sm"
                                            >
                                              −
                                            </button>
                                            <span data-testid={`text-quantity-${category.id}-half`} className="w-5 text-center text-xs font-bold">
                                              {currentHalfQty}
                                            </span>
                                          </>
                                        ) : null}
                                        <button
                                          data-testid={`button-add-${category.id}-half`}
                                          disabled={availHalf <= 0 || currentHalfQty >= availHalf}
                                          onClick={() => add(category.id, 'half_kilo', 1)}
                                          className="inline-flex items-center gap-1 rounded-lg bg-[hsl(38_74%_45%)] dark:bg-[hsl(38_74%_55%)] px-2.5 py-1.5 text-xs font-bold text-white dark:text-[hsl(164_31%_18%)] hover:opacity-90 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                          {currentHalfQty > 0 ? <Plus size={14} /> : t('addHalfKilo')}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : (
                              (() => {
                                const availReg = category.availableStock !== undefined ? category.availableStock : category.stockQuantity;
                                const currentRegQty = cart[`${category.id}:${category.unit}`] || 0;
                                return (
                                  <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                                    <span className={`text-xs ${availReg <= (category.lowStockThreshold || 0) ? 'font-bold text-[hsl(3_58%_48%)]' : 'text-muted-foreground'}`}>
                                      {availReg > 0 ? `${availReg} ${getUnitLabel(category.unit, language)} ${t('left')}` : t('soldOut')}
                                    </span>
                                    <div className="flex items-center gap-1.5 sm:gap-2">
                                      {currentRegQty > 0 ? (
                                        <>
                                          <button
                                            data-testid={`button-decrease-${category.id}`}
                                            onClick={() => add(category.id, category.unit, -1)}
                                            className="grid size-7 sm:size-8 place-items-center rounded-lg border border-border font-bold hover:bg-muted transition-colors text-sm"
                                          >
                                            −
                                          </button>
                                          <span data-testid={`text-quantity-${category.id}`} className="w-5 text-center text-xs sm:text-sm font-bold">
                                            {currentRegQty}
                                          </span>
                                        </>
                                      ) : null}
                                      <button
                                        data-testid={`button-add-${category.id}`}
                                        disabled={availReg <= 0 || currentRegQty >= availReg}
                                        onClick={() => add(category.id, category.unit, 1)}
                                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        {currentRegQty > 0 ? <Plus size={14} /> : t('addToBox')}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <aside className="h-fit rounded-2xl border border-border bg-card p-4 sm:p-5 md:sticky md:top-24">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t('yourBox')}</p>
                {cartLines.length === 0 ? (
                  <div className="py-8 sm:py-10 text-center">
                    <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                      <ShoppingBag size={20} />
                    </div>
                    <p className="mt-3 text-sm font-semibold">{t('nothingYet')}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('addSweet')}</p>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 sm:mt-5 space-y-2.5 sm:space-y-3">
                      {cartLines.map((line) => (
                        <div key={line.key} className="flex items-center justify-between text-xs sm:text-sm gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={line.category.imageUrl || getCategoryFallbackImage(line.category.name)}
                              alt=""
                              className="size-7 sm:size-8 rounded-lg object-cover border border-border shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = getCategoryFallbackImage(line.category.name);
                              }}
                            />
                            <div className="min-w-0">
                              <span className="truncate block font-semibold">{line.category.name}</span>
                              <span className="text-[11px] text-muted-foreground block">
                                {line.quantity} {getUnitLabel(line.unit, language)} · {money.format(line.unitPrice)}
                              </span>
                            </div>
                          </div>
                          <span className="font-mono-ui text-xs shrink-0">{money.format(line.lineTotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="my-4 sm:my-5 border-t border-dashed border-border" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{t('estimatedTotal')}</span>
                      <span data-testid="text-cart-total" className="font-display text-xl sm:text-2xl">{money.format(total)}</span>
                    </div>
                    <button
                      data-testid="button-checkout"
                      onClick={() => setStep('details')}
                      className="mt-4 sm:mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(9_54%_55%)] px-4 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.01]"
                    >
                      {t('pickupDetails')} <ArrowRight size={16} />
                    </button>
                  </>
                )}
              </aside>
            </section>

            {cartLines.length > 0 && (
              <div className="fixed bottom-4 inset-x-3.5 sm:inset-x-4 z-40 md:hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[hsl(164_31%_18%)] p-3 text-[hsl(39_45%_94%)] shadow-2xl border border-[hsl(38_74%_63%/0.3)]">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(38_74%_63%)]">{cartLines.length} {t('selections')}</p>
                    <p className="font-display text-base sm:text-lg font-bold text-white truncate">{money.format(total)}</p>
                  </div>
                  <button
                    data-testid="button-mobile-checkout"
                    onClick={() => setStep('details')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(9_54%_55%)] px-3.5 py-2 text-xs font-bold text-white hover:bg-[hsl(9_54%_48%)] transition-colors shrink-0 shadow-md"
                  >
                    <span>{t('pickupDetails')}</span>
                    <ArrowRight size={14} className="rtl:rotate-180" />
                  </button>
                </div>
              </div>
            )}

            <footer className="mt-14 border-t border-border/60 pt-6 pb-4 text-center text-xs text-muted-foreground">
              <div className="flex flex-wrap justify-center items-center gap-3 mb-2">
                <Link href="/admin/login" className="font-bold text-foreground hover:underline inline-flex items-center gap-1.5">
                  <KeyRound size={13} className="text-[hsl(38_74%_63%)]" /> {t('staffSignIn')}
                </Link>
                <span className="text-border">•</span>
                <Link href="/track" className="hover:underline inline-flex items-center gap-1">
                  <ClipboardList size={13} /> {t('trackOrder')}
                </Link>
              </div>
              <p className="text-[11px]">© {new Date().getFullYear()} حلويات فتوح — لخدمتكم طوال أيام العيد</p>
            </footer>
          </>
        )}
        {step === 'details' && (
          <OrderDetails
            customer={customer}
            setCustomer={setCustomer}
            total={total}
            cartLines={cartLines}
            cart={cart}
            onBack={() => setStep('shop')}
            onSubmit={submit}
            isPending={createOrder.isPending}
            error={createOrder.isError}
          />
        )}
        {step === 'success' && completedOrder && <OrderSuccess order={completedOrder} onReset={resetOrder} />}
      </main>
    </div>
  );
}

function OrderDetails({
  customer,
  setCustomer,
  total,
  cartLines,
  cart,
  onBack,
  onSubmit,
  isPending,
  error,
}: {
  customer: { name: string; phone: string; date: string; time: string; notes: string };
  setCustomer: (value: { name: string; phone: string; date: string; time: string; notes: string }) => void;
  total: number;
  cartLines: Array<{
    category: Category;
    unit: 'kilo' | 'half_kilo' | 'box' | 'piece';
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    key: string;
  }>;
  cart: Record<string, number>;
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
  error: boolean;
}) {
  const { t, language } = useLanguage();
  const [sightingOffset] = useHijriOffset();
  const update = (key: keyof typeof customer, value: string) => setCustomer({ ...customer, [key]: value });

  const todayInfo = useMemo(() => getCairoDateInfo(0, sightingOffset), [sightingOffset]);
  const tomorrowInfo = useMemo(() => getCairoDateInfo(1, sightingOffset), [sightingOffset]);
  const weekDays = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => getCairoDateInfo(i, sightingOffset)), [sightingOffset]);
  const eidMilestones = useMemo(() => getUpcomingEidMilestones(todayInfo.iso, sightingOffset), [todayInfo.iso, sightingOffset]);

  useEffect(() => {
    if (!customer.date) {
      update('date', todayInfo.iso);
    }
  }, [customer.date, todayInfo.iso]);

  const [dateCategory, setDateCategory] = useState<'today' | 'tomorrow' | 'eid' | 'thisWeek' | 'custom'>(() => {
    if (!customer.date || customer.date === todayInfo.iso) return 'today';
    if (customer.date === tomorrowInfo.iso) return 'tomorrow';
    if (eidMilestones.some((m) => m.isoDate === customer.date)) return 'eid';
    if (weekDays.some((w) => w.iso === customer.date)) return 'thisWeek';
    return 'custom';
  });

  const [timePeriod, setTimePeriod] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');

  const filteredSlots = useMemo(() => {
    if (timePeriod === 'all') return PICKUP_TIME_SLOTS;
    return PICKUP_TIME_SLOTS.filter((s) => s.period === timePeriod);
  }, [timePeriod]);

  const selectDatePreset = (category: 'today' | 'tomorrow' | 'eid' | 'thisWeek' | 'custom', targetDate?: string) => {
    setDateCategory(category);
    if (category === 'today') {
      update('date', todayInfo.iso);
    } else if (category === 'tomorrow') {
      update('date', tomorrowInfo.iso);
    } else if (category === 'eid' && targetDate) {
      update('date', targetDate);
    }
  };

  const selectedDateInfo = weekDays.find((d) => d.iso === customer.date) || {
    iso: customer.date,
    dayNameAr: '',
    dayNameEn: '',
    formattedAr: customer.date,
    formattedEn: customer.date,
  };

  const valid =
    customer.name.trim().length >= 2 &&
    customer.phone.trim().length >= 7 &&
    customer.date &&
    customer.time;

  return (
    <section className="mx-auto max-w-4xl py-6 sm:py-10 md:py-16">
      <button
        data-testid="button-back-shop"
        onClick={onBack}
        className="mb-6 sm:mb-8 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowRight size={15} className="rotate-180" /> {t('backToSweets')}
      </button>

      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">
            {t('almostThere')}
          </p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">{t('meetYou')}</h1>
          <p className="mt-2 sm:mt-3 text-sm text-muted-foreground">{t('holdOrder')}</p>

          <div className="mt-6 sm:mt-8 space-y-6">
            <label className="block text-sm font-bold">
              {t('yourName')}
              <input
                data-testid="input-customer-name"
                value={customer.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder={t('namePlaceholder')}
                className="mt-2 w-full rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
            </label>

            <label className="block text-sm font-bold">
              {t('mobileNumber')}
              <input
                data-testid="input-customer-phone"
                value={customer.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder={t('phonePlaceholder')}
                className="mt-2 w-full rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
            </label>

            {/* Pickup Date Categories */}
            <div className="space-y-3.5 rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-bold flex items-center gap-2">
                  <CalendarDays size={17} className="text-[hsl(9_54%_63%)]" />
                  <span>{t('pickupDate')}</span>
                </label>
                {customer.date && (
                  <span className="rounded-full bg-[hsl(38_74%_63%/0.15)] px-3 py-1 text-xs font-semibold text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)] flex items-center gap-1.5">
                    <span>🌙</span>
                    <span>{formatDualDate(customer.date, language, sightingOffset)}</span>
                  </span>
                )}
              </div>

              {/* Date Presets Grid */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  data-testid="button-date-today"
                  onClick={() => selectDatePreset('today')}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border p-2.5 sm:p-3 text-xs font-bold transition-all ${
                    dateCategory === 'today' && customer.date === todayInfo.iso
                      ? 'border-[hsl(38_74%_63%)] bg-[hsl(164_31%_18%)] text-white shadow-md ring-1 ring-[hsl(38_74%_63%)]'
                      : 'border-border bg-card text-foreground hover:bg-muted/70'
                  }`}
                >
                  <span className="text-xs sm:text-sm">{t('todayLabel')}</span>
                  <span className="text-[10px] font-medium opacity-80">
                    {language === 'ar' ? todayInfo.formattedAr : todayInfo.formattedEn}
                  </span>
                  <span className="text-[10px] font-semibold text-[hsl(38_74%_55%)]">
                    🌙 {language === 'ar' ? todayInfo.hijriFormattedAr : todayInfo.hijriFormattedEn}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="button-date-tomorrow"
                  onClick={() => selectDatePreset('tomorrow')}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border p-2.5 sm:p-3 text-xs font-bold transition-all ${
                    dateCategory === 'tomorrow' && customer.date === tomorrowInfo.iso
                      ? 'border-[hsl(38_74%_63%)] bg-[hsl(164_31%_18%)] text-white shadow-md ring-1 ring-[hsl(38_74%_63%)]'
                      : 'border-border bg-card text-foreground hover:bg-muted/70'
                  }`}
                >
                  <span className="text-xs sm:text-sm">{t('tomorrowLabel')}</span>
                  <span className="text-[10px] font-medium opacity-80">
                    {language === 'ar' ? tomorrowInfo.formattedAr : tomorrowInfo.formattedEn}
                  </span>
                  <span className="text-[10px] font-semibold text-[hsl(38_74%_55%)]">
                    🌙 {language === 'ar' ? tomorrowInfo.hijriFormattedAr : tomorrowInfo.hijriFormattedEn}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="button-date-this-week"
                  onClick={() => selectDatePreset('thisWeek')}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border p-2.5 sm:p-3 text-xs font-bold transition-all ${
                    dateCategory === 'thisWeek'
                      ? 'border-[hsl(38_74%_63%)] bg-[hsl(164_31%_18%)] text-white shadow-md ring-1 ring-[hsl(38_74%_63%)]'
                      : 'border-border bg-card text-foreground hover:bg-muted/70'
                  }`}
                >
                  <span className="text-xs sm:text-sm">{t('thisWeekLabel')}</span>
                  <span className="text-[10px] font-medium opacity-80">
                    7 {language === 'ar' ? 'أيام بالتاريخين' : 'days dual'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="button-date-custom"
                  onClick={() => selectDatePreset('custom')}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border p-2.5 sm:p-3 text-xs font-bold transition-all ${
                    dateCategory === 'custom'
                      ? 'border-[hsl(38_74%_63%)] bg-[hsl(164_31%_18%)] text-white shadow-md ring-1 ring-[hsl(38_74%_63%)]'
                      : 'border-border bg-card text-foreground hover:bg-muted/70'
                  }`}
                >
                  <span className="text-xs sm:text-sm">{t('customDateLabel')}</span>
                  <span className="text-[10px] font-medium opacity-80">
                    {customer.date && dateCategory === 'custom' ? customer.date : '📅'}
                  </span>
                </button>
              </div>

              {/* Eid Milestones Quick Presets */}
              {eidMilestones.length > 0 && (
                <div className="rounded-xl border border-[hsl(38_74%_63%/0.35)] bg-gradient-to-r from-[hsl(38_74%_63%/0.08)] to-transparent p-3 sm:p-4 animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-[hsl(38_74%_63%)]" />
                      <span className="text-xs font-bold text-foreground">
                        {t('eidMilestonesTitle')}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {t('eidDirectBooking')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {eidMilestones.map((milestone) => {
                      const isSelected = customer.date === milestone.isoDate;
                      return (
                        <button
                          key={milestone.id}
                          type="button"
                          data-testid={`button-eid-${milestone.id}`}
                          onClick={() => selectDatePreset('eid', milestone.isoDate)}
                          className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 sm:p-3 text-center transition-all ${
                            isSelected
                              ? 'border-[hsl(38_74%_63%)] bg-[hsl(164_31%_18%)] text-white shadow-md ring-2 ring-[hsl(38_74%_63%)]'
                              : 'border-[hsl(38_74%_63%/0.3)] bg-card/90 text-foreground hover:border-[hsl(38_74%_63%)] hover:bg-[hsl(38_74%_63%/0.05)]'
                          }`}
                        >
                          <span className="text-xs sm:text-sm font-bold">
                            {language === 'ar' ? milestone.titleAr : milestone.titleEn}
                          </span>
                          <span
                            className={`text-[10px] font-semibold ${
                              isSelected
                                ? 'text-[hsl(38_74%_63%)]'
                                : 'text-[hsl(34_65%_45%)] dark:text-[hsl(38_74%_63%)]'
                            }`}
                          >
                            {language === 'ar' ? milestone.subtitleAr : milestone.subtitleEn}
                          </span>
                          <span className="text-[10px] opacity-80 font-mono">
                            {language === 'ar'
                              ? `${milestone.dayNameAr} ${milestone.gregorianFormattedAr}`
                              : `${milestone.dayNameEn}, ${milestone.gregorianFormattedEn}`}
                          </span>
                          {isSelected && (
                            <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-[hsl(38_74%_63%)] text-[hsl(164_31%_18%)] shadow-xs">
                              <Check size={11} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Days of this week list */}
              {dateCategory === 'thisWeek' && (
                <div className="rounded-xl border border-border/80 bg-muted/40 p-3 animate-in fade-in duration-200">
                  <p className="mb-2.5 text-[11px] font-bold text-muted-foreground">
                    {language === 'ar' ? 'اختر اليوم المناسب للاستلام:' : 'Select pickup day:'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
                    {weekDays.map((day) => {
                      const isSelected = customer.date === day.iso;
                      return (
                        <button
                          key={day.iso}
                          type="button"
                          onClick={() => update('date', day.iso)}
                          className={`flex flex-col items-center justify-center rounded-lg p-2 text-center transition-all ${
                            isSelected
                              ? 'border border-[hsl(38_74%_63%)] bg-[hsl(164_31%_18%)] text-white font-bold shadow-sm'
                              : 'border border-border/70 bg-card text-foreground hover:border-primary/50'
                          }`}
                        >
                          <span className="text-xs font-bold">
                            {language === 'ar' ? day.dayNameAr : day.dayNameEn}
                          </span>
                          <span className="text-[10px] opacity-80 mt-0.5">
                            {language === 'ar' ? day.formattedAr : day.formattedEn}
                          </span>
                          <span className="text-[9px] font-semibold text-[hsl(38_74%_55%)] mt-0.5">
                            🌙 {language === 'ar' ? day.hijriFormattedAr : day.hijriFormattedEn}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Calendar Date Input */}
              <div className={dateCategory === 'custom' ? 'block animate-in fade-in duration-200' : 'sr-only'}>
                <input
                  data-testid="input-pickup-date"
                  type="date"
                  value={customer.date}
                  onChange={(e) => update('date', e.target.value)}
                  min={todayInfo.iso}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                />
                {customer.date && (
                  <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                    <span>🌙</span>
                    <span>{formatDualDate(customer.date, language, sightingOffset)}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Pickup Time Slots */}
            <div className="space-y-3 rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-bold flex items-center gap-2">
                  <Clock3 size={17} className="text-[hsl(9_54%_63%)]" />
                  <span>{t('pickupTimeSlot')}</span>
                </label>
                {customer.time && (
                  <span className="rounded-full bg-[hsl(164_31%_18%/0.1)] dark:bg-[hsl(38_74%_63%/0.15)] px-2.5 py-1 text-xs font-bold text-[hsl(164_31%_24%)] dark:text-[hsl(38_74%_63%)]">
                    {formatPickupTimeSlot(customer.time, language)}
                  </span>
                )}
              </div>

              {/* Period Tabs */}
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTimePeriod('all')}
                  className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                    timePeriod === 'all'
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('allSlots')}
                </button>
                <button
                  type="button"
                  onClick={() => setTimePeriod('morning')}
                  className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                    timePeriod === 'morning'
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('morningSlot')}
                </button>
                <button
                  type="button"
                  onClick={() => setTimePeriod('afternoon')}
                  className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                    timePeriod === 'afternoon'
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('afternoonSlot')}
                </button>
                <button
                  type="button"
                  onClick={() => setTimePeriod('evening')}
                  className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                    timePeriod === 'evening'
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('eveningSlot')}
                </button>
              </div>

              {/* Time Slots Grid */}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-4">
                {filteredSlots.map((slot) => {
                  const isSelected = customer.time === slot.time;
                  return (
                    <button
                      key={slot.time}
                      type="button"
                      data-testid={`slot-${slot.time}`}
                      onClick={() => update('time', slot.time)}
                      className={`flex items-center justify-center gap-1 rounded-xl border p-2.5 text-xs font-bold transition-all ${
                        isSelected
                          ? 'border-[hsl(38_74%_63%)] bg-[hsl(164_31%_18%)] text-white shadow-sm ring-1 ring-[hsl(38_74%_63%)]'
                          : 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      {isSelected && <Check size={13} className="text-[hsl(38_74%_63%)] shrink-0" />}
                      <span>{language === 'ar' ? slot.labelAr : slot.labelEn}</span>
                    </button>
                  );
                })}
              </div>

              {/* Exact time select dropdown */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                <label className="text-xs text-muted-foreground shrink-0">
                  {t('customTimeOption')}:
                </label>
                <select
                  data-testid="select-pickup-time"
                  value={customer.time}
                  onChange={(e) => update('time', e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-normal outline-none focus:border-primary"
                >
                  {PICKUP_TIME_SLOTS.map((s) => (
                    <option key={s.time} value={s.time}>
                      {language === 'ar' ? s.labelAr : s.labelEn} ({s.time})
                    </option>
                  ))}
                  {!PICKUP_TIME_SLOTS.some((s) => s.time === customer.time) && customer.time && (
                    <option value={customer.time}>{customer.time}</option>
                  )}
                </select>
              </div>
            </div>

            {/* Selected Time Banner */}
            {customer.date && customer.time && (
              <div className="flex items-center gap-2.5 rounded-xl border border-[hsl(38_74%_63%/0.4)] bg-[hsl(38_74%_63%/0.12)] p-3 text-xs">
                <Clock3 size={16} className="text-[hsl(9_54%_63%)] shrink-0" />
                <div className="text-foreground">
                  <span className="font-bold text-[hsl(164_31%_18%)] dark:text-[hsl(38_74%_63%)]">
                    {t('selectedPickupNotice')}:
                  </span>{' '}
                  <span className="font-bold underline decoration-[hsl(38_74%_63%)] decoration-2 underline-offset-2">
                    {formatDualDate(customer.date, language, sightingOffset)} — {formatPickupTimeSlot(customer.time, language)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            <label className="block text-sm font-bold">
              {t('kitchenNote')} <span className="font-normal text-muted-foreground">{t('optional')}</span>
              <textarea
                data-testid="input-order-notes"
                value={customer.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder={t('notePlaceholder')}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
              />
            </label>
          </div>
        </div>

        <aside className="h-fit rounded-2xl bg-[hsl(164_31%_18%)] p-5 text-[hsl(39_45%_94%)] sticky top-24 shadow-xl border border-[hsl(38_74%_63%/0.25)]">
          <div className="mb-4 flex items-center justify-between border-b border-[hsl(39_45%_94%/0.15)] pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">
                {t('orderSummary')}
              </p>
              <p className="mt-0.5 text-xs text-[hsl(39_18%_69%)]">
                {cartLines.length} {t('selections')}
              </p>
            </div>
            <button
              type="button"
              data-testid="button-edit-box-aside"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(39_45%_94%/0.1)] px-2.5 py-1.5 text-xs font-semibold text-[hsl(38_74%_63%)] hover:bg-[hsl(39_45%_94%/0.2)] transition-colors"
            >
              <Pencil size={12} />
              <span>{t('editBox')}</span>
            </button>
          </div>

          {/* Itemized List */}
          <div className="max-h-64 overflow-y-auto space-y-3 pr-1 divide-y divide-[hsl(39_45%_94%/0.1)]">
            {cartLines.map((line) => (
              <div key={line.key} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={line.category.imageUrl || getCategoryFallbackImage(line.category.name)}
                    alt=""
                    className="size-10 rounded-lg object-cover border border-[hsl(39_45%_94%/0.2)] shrink-0"
                    onError={(e) => {
                      e.currentTarget.src = getCategoryFallbackImage(line.category.name);
                    }}
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate text-xs sm:text-sm">{line.category.name}</p>
                    <p className="text-[11px] text-[hsl(39_18%_69%)]">
                      {line.quantity} {getUnitLabel(line.unit, language)} × {money.format(line.unitPrice)}
                    </p>
                  </div>
                </div>
                <span className="font-mono-ui font-bold text-[hsl(38_74%_63%)] shrink-0 text-sm">
                  {money.format(line.lineTotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-dashed border-[hsl(39_45%_94%/0.2)]" />

          {/* Total Section */}
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-[hsl(39_18%_69%)] font-bold">{t('grandTotal')}</span>
            <span data-testid="text-aside-grand-total" className="font-display text-3xl font-bold text-[hsl(38_74%_63%)]">
              {money.format(total)}
            </span>
          </div>

          <p className="mt-3 text-xs leading-5 text-[hsl(39_18%_69%)]">{t('paymentInPerson')}</p>

          <button
            data-testid="button-place-order"
            disabled={!valid || isPending}
            onClick={onSubmit}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(38_74%_63%)] px-4 py-3 text-sm font-bold text-[hsl(164_31%_18%)] transition-transform hover:scale-[1.01] disabled:opacity-45 shadow-lg"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {isPending ? t('sendingRequest') : t('placeRequest')}
          </button>
          {error && <p className="mt-3 text-xs text-[hsl(9_54%_63%)]">{t('saveError')}</p>}
        </aside>
      </div>
    </section>
  );
}

function OnScreenReceipt({ order }: { order: Order }) {
  const { t, language } = useLanguage();
  const [copied, setCopied] = useState(false);
  const formattedDate = order.createdAt ? String(order.createdAt).slice(0, 10) : '';

  const copyOrderNumber = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(order.orderNumber).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div
      data-testid="on-screen-receipt"
      className="mx-auto mt-8 w-full max-w-xl text-start rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-xl transition-all"
    >
      {/* Receipt Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[hsl(153_28%_48%)]" />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">
              {t('receiptCardTitle')}
            </span>
          </div>
          <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground">
            حلويات فتوح
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('receiptSubtitle')}</p>
        </div>
        <div className="flex flex-col items-end">
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-muted px-3 py-1.5 text-xs font-bold font-mono">
            <span className="text-muted-foreground">#</span>
            <span className="text-primary">{order.orderNumber}</span>
            <button
              type="button"
              onClick={copyOrderNumber}
              className="ms-1 text-muted-foreground hover:text-foreground transition-colors"
              title={language === 'ar' ? 'نسخ رقم الطلب' : 'Copy order number'}
            >
              {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
            </button>
          </div>
          <span className="mt-1.5 text-[11px] text-muted-foreground">{formattedDate}</span>
        </div>
      </div>

      {/* Customer & Pickup Details */}
      <div className="mt-6 rounded-2xl bg-muted/40 p-4 border border-border/60">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
          {t('customerDetails')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div>
            <span className="text-muted-foreground block">{t('yourName')}:</span>
            <strong className="text-foreground text-sm font-semibold">{order.customerName}</strong>
          </div>
          <div>
            <span className="text-muted-foreground block">{t('mobileNumber')}:</span>
            <strong className="text-foreground text-sm font-mono" dir="ltr">
              {order.phoneNumber}
            </strong>
          </div>
          <div className="sm:col-span-2 flex items-center gap-2 pt-2 border-t border-border/40">
            <Clock3 size={15} className="text-[hsl(9_54%_63%)] shrink-0" />
            <div className="text-xs">
              <span className="text-muted-foreground">{t('pickupDate')}: </span>
              <strong className="text-foreground font-semibold">
                {formatDualDate(order.pickupDate, language)} — {formatPickupTimeSlot(order.pickupTime, language)}
              </strong>
            </div>
          </div>
          {order.notes && (
            <div className="sm:col-span-2 pt-2 border-t border-border/40 text-xs italic text-muted-foreground">
              <span>{t('kitchenNote')}: </span>
              <span className="text-foreground">“{order.notes}”</span>
            </div>
          )}
        </div>
      </div>

      {/* Ordered Items Table */}
      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
          {t('orderedItems')}
        </p>
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
              <tr>
                <th className="py-2.5 px-3 text-start">{t('item')}</th>
                <th className="py-2.5 px-3 text-center">{t('qty')}</th>
                <th className="py-2.5 px-3 text-end">{t('subtotal')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {order.items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-foreground">{item.categoryName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {getUnitLabel(item.unit, language)}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-foreground">
                    {item.quantity} {getUnitLabel(item.unit, language)}
                  </td>
                  <td className="py-3 px-3 text-end font-mono font-bold text-foreground" dir="ltr">
                    {money.format(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financials & Totals */}
      <div className="mt-6 space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('paymentMethod')}:</span>
          <strong className="text-foreground">{t('cashAtPickup')}</strong>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('paymentStatus')}:</span>
          <strong className="text-foreground">{t('unpaidPickupNotice')}</strong>
        </div>
        <div className="my-2 border-t border-dashed border-border" />
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm font-bold text-foreground">{t('grandTotal')}:</span>
          <span className="font-display text-2xl sm:text-3xl font-bold text-primary" dir="ltr">
            {money.format(order.totalPrice)}
          </span>
        </div>
      </div>

      {/* Footer Reminder */}
      <div className="mt-6 rounded-2xl bg-[hsl(38_74%_63%/0.12)] p-3.5 border border-[hsl(38_74%_63%/0.35)] flex items-start gap-2.5 text-xs text-foreground">
        <ShieldCheck size={18} className="text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)] shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)]">
            {t('keepOrderNumber')}
          </p>
          <p className="mt-0.5 text-muted-foreground text-[11px]">
            {language === 'ar'
              ? 'يمكنك دائماً متابعة وتتبع حالة طلبك باستخدام رقم الطلب أو رقم الهاتف.'
              : 'You can track the progress of your order anytime using your order number or phone.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function OrderSuccess({ order, onReset }: { order: Order; onReset: () => void }) {
  const { t } = useLanguage();
  return (
    <section className="mx-auto max-w-2xl py-12 sm:py-16 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[hsl(153_28%_48%/0.16)] text-[hsl(153_38%_30%)] shadow-sm">
        <Check size={30} />
      </div>
      <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(9_54%_63%)]">
        {t('requestReceived')}
      </p>
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">{t('sweetsOnList')}</h1>
      <p className="mx-auto mt-4 max-w-md leading-7 text-muted-foreground">{t('requestSent')}</p>

      {/* On-Screen Full Receipt Breakdown */}
      <OnScreenReceipt order={order} />

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          data-testid="button-print-receipt"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-[hsl(9_54%_55%)] px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-[hsl(9_54%_48%)] transition-colors"
        >
          <Printer size={16} /> {t('printReceipt')}
        </button>
        <Link
          href="/track"
          data-testid="link-track-success"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-colors"
        >
          {t('trackOrder')} <ArrowRight size={16} />
        </Link>
        <button
          type="button"
          data-testid="link-order-another"
          onClick={onReset}
          className="rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold hover:bg-muted transition-colors"
        >
          {t('orderAnother')}
        </button>
      </div>

      <PrintableReceipt order={order} />
    </section>
  );
}

function TrackPage() {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<'orderNumber' | 'phone'>('orderNumber');
  const [value, setValue] = useState('');
  const [params, setParams] = useState<{ orderNumber?: string; phone?: string }>({});
  const trackQuery = useTrackOrder(params, { query: { enabled: Boolean(params.orderNumber || params.phone), queryKey: getTrackOrderQueryKey(params) } });
  const orders = Array.isArray(trackQuery.data) ? trackQuery.data : [];
  return <div className="min-h-[100dvh] bg-background surface-grid"><PublicHeader /><main className="mx-auto max-w-4xl px-5 pb-20 pt-12 md:px-10 md:pt-24"><div className="mx-auto max-w-xl text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.25)] text-[hsl(164_31%_18%)]"><Search size={22} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(9_54%_63%)]">{t('pickupStarts')}</p><h1 className="mt-3 font-display text-5xl">{t('findOrder')}</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">{t('trackHelp')}</p><div className="mt-8 rounded-2xl border border-border bg-card p-2 shadow-sm"><div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"><button data-testid="button-track-order-number" onClick={() => setMode('orderNumber')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'orderNumber' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{t('orderNumber')}</button><button data-testid="button-track-phone" onClick={() => setMode('phone')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'phone' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{t('mobile')}</button></div><div className="mt-3 flex gap-2"><input data-testid="input-track-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === 'orderNumber' ? (language === 'ar' ? 'مثال: 83921' : 'e.g. 83921') : (language === 'ar' ? 'مثال: 010 1234 5678' : 'e.g. 010 1234 5678')} className="min-w-0 flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary" /><button data-testid="button-find-order" disabled={!value.trim() || trackQuery.isFetching} onClick={() => setParams(mode === 'orderNumber' ? { orderNumber: value.trim() } : { phone: value.trim() })} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40">{trackQuery.isFetching ? <Loader2 size={17} className="animate-spin" /> : t('find')}</button></div></div></div>{trackQuery.isError && <div className="mx-auto mt-8 max-w-xl"><QueryError retry={() => trackQuery.refetch()} /></div>}{params.orderNumber || params.phone ? !trackQuery.isLoading && !trackQuery.isError && orders.length === 0 ? <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-dashed border-border p-10 text-center"><p className="font-display text-2xl">{t('noOrder')}</p><p className="mt-2 text-sm text-muted-foreground">{t('checkDetails')}</p></div> : <div className="mt-10 space-y-4">{orders.map((order) => <TrackCard key={order.id} order={order} />)}</div> : null}</main></div>;
}

function TrackCard({ order }: { order: Order }) {
  const { language, t } = useLanguage();
  const statuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'delivered'];
  const currentIndex = statuses.indexOf(order.status);
  const deposit = order.depositAmount ?? 0;
  const remaining = order.remainingBalance !== undefined ? order.remainingBalance : Math.max(0, order.totalPrice - deposit);
  const isPaid = order.paymentStatus === 'paid' || (remaining <= 0 && order.totalPrice > 0);

  return (
    <article data-testid={`card-tracked-order-${order.id}`} className="rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono-ui text-xs text-muted-foreground">{order.orderNumber}</p>
          <h2 className="mt-1 font-display text-3xl">{getStatusLabel(order.status, language)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isPaid ? 'bg-[hsl(153_28%_48%/0.15)] text-[hsl(153_38%_30%)]' : deposit > 0 ? 'bg-[hsl(38_74%_63%/0.2)] text-[hsl(34_65%_35%)]' : 'bg-muted text-muted-foreground'}`}>
            {getPaymentStatusLabel(order.paymentStatus || (isPaid ? 'paid' : deposit > 0 ? 'partially_paid' : 'unpaid'), language)}
          </span>
          <StatusPill status={order.status} />
        </div>
      </div>
      <div className="mt-8 flex items-start">
        {statuses.map((status, index) => (
          <div key={status} className="flex flex-1 flex-col items-center gap-2 text-center">
            <div className={`relative grid size-8 place-items-center rounded-full border-2 ${index <= currentIndex ? 'border-[hsl(38_74%_63%)] bg-[hsl(38_74%_63%)] text-[hsl(164_31%_18%)]' : 'border-border text-muted-foreground'}`}>
              {index < currentIndex ? <Check size={14} /> : <span className="text-[10px]">{index + 1}</span>}
              {index < statuses.length - 1 && <span className={`absolute left-7 top-1/2 h-0.5 w-[calc(100%+2rem)] -translate-y-1/2 ${index < currentIndex ? 'bg-[hsl(38_74%_63%)]' : 'bg-border'}`} />}
            </div>
            <span className="text-[10px] font-bold leading-4 text-muted-foreground">{getStatusLabel(status, language)}</span>
          </div>
        ))}
      </div>
      <div className="mt-7 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('pickup')}</p>
          <p className="mt-1 font-semibold">{formatDualDate(order.pickupDate, language)} — {formatPickupTimeSlot(order.pickupTime, language)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('forCustomer')}</p>
          <p className="mt-1 font-semibold">{order.customerName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('total')}</p>
          <p className="mt-1 font-mono-ui text-xs font-bold text-primary">{money.format(order.totalPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{language === 'ar' ? 'العربون / المتبقي' : 'Deposit / Remaining'}</p>
          <p className="mt-1 font-mono-ui text-xs font-bold">
            {deposit > 0 ? (
              <span className="text-[hsl(38_74%_45%)]">{money.format(deposit)}</span>
            ) : (
              <span className="text-muted-foreground">{language === 'ar' ? 'بدون عربون' : 'No deposit'}</span>
            )}
            {' · '}
            <span className={remaining > 0 ? 'text-[hsl(9_54%_55%)]' : 'text-[hsl(153_38%_30%)]'}>
              {remaining > 0 ? (language === 'ar' ? `باقي ${money.format(remaining)}` : `${money.format(remaining)} left`) : (language === 'ar' ? 'مسدد' : 'Paid')}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'gold' }: { label: string; value: string | number; detail: string; icon: typeof BarChart3; tone?: 'gold' | 'rose' | 'green' | 'blue' }) {
  const { t } = useLanguage();
  const colors = { gold: 'bg-[hsl(38_74%_63%/0.17)] text-[hsl(34_65%_40%)]', rose: 'bg-[hsl(9_54%_63%/0.14)] text-[hsl(9_54%_50%)]', green: 'bg-[hsl(153_28%_48%/0.14)] text-[hsl(153_38%_30%)]', blue: 'bg-[hsl(207_42%_88%)] text-[hsl(207_42%_30%)]' };
  return <div data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="lift rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between"><span className={`grid size-9 place-items-center rounded-xl ${colors[tone]}`}><Icon size={17} /></span><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t('live')}</span></div><p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-3xl">{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></div>;
}

function AdminOverview() {
  const { t, language } = useLanguage();
  const summaryQuery = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const todayAnalyticsParams: GetDashboardAnalyticsParams = {
    timeframe: 'today',
    statusMode: 'delivered',
  };
  const todayAnalyticsQuery = useGetDashboardAnalytics(todayAnalyticsParams, {
    query: {
      queryKey: getGetDashboardAnalyticsQueryKey(todayAnalyticsParams),
      refetchInterval: 15_000,
    },
  });
  const todayLocal = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  const todayStr = todayLocal();

  const ordersQuery = useListOrders(undefined, {
    query: {
      queryKey: getListOrdersQueryKey(),
      refetchInterval: 10_000,
    },
  });
  const summary = summaryQuery.data as DashboardSummary | undefined;
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedQuery = useGetOrder(selectedId ?? 0, {
    query: {
      enabled: selectedId !== null,
      queryKey: getGetOrderQueryKey(selectedId ?? 0),
    },
  });
  const updateOrder = useUpdateOrder();

  const handleStatusChange = (order: Order, status: OrderStatus) => {
    updateOrder.mutate(
      {
        orderId: order.id,
        data: { status },
      },
      {
        onSuccess: () => {
          ordersQuery.refetch();
          summaryQuery.refetch();
        },
      },
    );
  };

  const handlePrint = (order: Order) => {
    setPrintingOrder(order);
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const allOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];
  const queueOrders = useMemo(() => {
    // Show orders that need attention:
    // 1. All pending orders (new pickup requests waiting for staff confirmation)
    // 2. Orders with pickup scheduled for today or created today
    // 3. Active orders currently preparing or ready
    const activeOrRelevant = allOrders.filter((order) => {
      const isPending = order.status === 'pending';
      const isTodayPickup = order.pickupDate === todayStr;
      const isTodayCreated = order.createdAt && String(order.createdAt).slice(0, 10) === todayStr;
      const isActive = ['accepted', 'preparing', 'ready'].includes(order.status);
      return isPending || isTodayPickup || isTodayCreated || isActive;
    });

    const list = activeOrRelevant.length > 0 ? activeOrRelevant : allOrders;
    return [...list].sort((a, b) => {
      // Pending orders always at the top
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      // Then newest created first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [allOrders, todayStr]);

  if (summaryQuery.isLoading) return <PageLoader label={t('loading')} />;
  if (summaryQuery.isError) return <QueryError retry={() => summaryQuery.refetch()} />;
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">
            {t('counterOverview')}
          </p>
          <h1 className="mt-2 font-display text-4xl md:text-5xl">{t('counterOverview')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('overviewDescription')}</p>
        </div>
        <Link
          href="/admin/orders"
          data-testid="link-open-queue"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          {t('openQueue')} <ArrowRight size={16} />
        </Link>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('needsReply')}
          value={summary?.pendingOrders ?? 0}
          detail={t('newPickupRequests')}
          icon={Bell}
          tone="gold"
        />
        <MetricCard
          label={t('todaysPickups')}
          value={summary?.todayOrders ?? 0}
          detail={t('allTimeSlots')}
          icon={CalendarDays}
          tone="blue"
        />
        <MetricCard
          label={t('acceptedRevenue')}
          value={money.format(summary?.acceptedRevenue ?? 0)}
          detail={t('confirmedOrders')}
          icon={TrendingUp}
          tone="green"
        />
        <MetricCard
          label={t('lowStockItems')}
          value={summary?.lowStockCount ?? 0}
          detail={t('worthChecking')}
          icon={Package}
          tone="rose"
        />
      </div>
      <div className="mt-8 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {t('pickupQueue')}
              </p>
              <h2 className="mt-1 font-display text-2xl">{t('todayCounter')}</h2>
            </div>
            <Link
              href="/admin/orders"
              data-testid="link-view-all-orders"
              className="text-xs font-bold text-[hsl(9_54%_55%)]"
            >
              {t('viewAll')}
            </Link>
          </div>
          {ordersQuery.isLoading ? (
            <PageLoader label={t('loadingOrders')} />
          ) : queueOrders.length === 0 ? (
            <EmptyQueue />
          ) : (
            <div className="mt-5 divide-y divide-border">
              {queueOrders.slice(0, 8).map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  onClick={() => setSelectedId(order.id)}
                  onPrint={() => handlePrint(order)}
                />
              ))}
            </div>
          )}
        </section>
        <div className="space-y-5">
          <section className="rounded-2xl bg-[hsl(164_31%_18%)] p-6 text-[hsl(39_45%_94%)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">
                  {t('eidReadiness')}
                </p>
                <h2 className="mt-2 font-display text-3xl">{t('keepJoy')}</h2>
              </div>
              <Sparkles size={24} className="text-[hsl(38_74%_63%)]" />
            </div>
            <div className="mt-10 flex items-end gap-3">
              <span className="font-display text-7xl text-[hsl(38_74%_63%)]">
                {summary?.daysUntilEid ?? '—'}
              </span>
              <span className="pb-3 text-sm text-[hsl(39_18%_69%)]">{t('daysUntilEid')}</span>
            </div>
            <div className="mt-6 border-t border-sidebar-border pt-5">
              <div className="flex justify-between text-sm">
                <span className="text-[hsl(39_18%_69%)]">{t('topSeller')}</span>
                <span className="font-semibold">{summary?.topCategory || t('notEnoughData')}</span>
              </div>
              <Link
                href="/admin/analytics"
                data-testid="link-see-analytics"
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[hsl(38_74%_63%)]"
              >
                {t('seePicture')} <ArrowRight size={15} />
              </Link>
            </div>
          </section>

          {/* Today's Top Sold Sweets Velocity Card */}
          <section className="rounded-2xl border border-border bg-card p-5 md:p-6" data-testid="section-today-top-sold">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('todayTopSold')}
                </p>
                <h3 className="mt-1 font-display text-lg">{t('todayTopSoldSubtitle')}</h3>
              </div>
              <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <TrendingUp size={18} />
              </div>
            </div>

            {todayAnalyticsQuery.isLoading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                <Loader2 className="mx-auto size-5 animate-spin text-primary" />
              </div>
            ) : (() => {
              const activeSold = (todayAnalyticsQuery.data?.categoryTotals || [])
                .filter((cat) => (cat.totalWeightKg ?? 0) > 0 || (cat.boxesSold ?? 0) > 0 || (cat.piecesSold ?? 0) > 0 || (cat.ordersCount ?? 0) > 0)
                .slice(0, 4);

              if (activeSold.length === 0) {
                return (
                  <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    {t('noSalesInPeriod')}
                  </div>
                );
              }

              return (
                <div className="mt-4 divide-y divide-border">
                  {activeSold.map((item) => (
                    <div key={item.categoryName} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.categoryName}
                              className="size-8 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs">
                              <Package size={14} className="text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">{item.categoryName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono-ui">
                              {item.unit === 'box'
                                ? `${item.boxesSold ?? item.totalWeightKg ?? 0} ${t('box')}`
                                : item.unit === 'piece'
                                ? `${item.piecesSold ?? item.totalWeightKg ?? 0} ${t('piece')}`
                                : `${(item.totalWeightKg ?? 0).toFixed(1)} ${language === 'ar' ? 'كجم' : 'kg'} (${item.kilosSold ?? 0}×1 + ${item.halfKilosSold ?? 0}×½)`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono-ui text-xs font-bold text-foreground">
                            {money.format(item.revenue)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {item.ordersCount ?? 0} {t('ordersCol')}
                          </p>
                        </div>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${Math.min(100, item.revenueShare ?? 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="mt-4 border-t border-border pt-3">
              <Link
                href="/admin/analytics?timeframe=today"
                className="flex items-center justify-between text-xs font-bold text-primary hover:underline"
              >
                <span>{t('viewFullReport')}</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </section>
        </div>
      </div>
      {selectedId !== null && (
        <OrderDetail
          order={selectedQuery.data || allOrders.find((o) => o.id === selectedId)}
          isLoading={selectedQuery.isLoading && !allOrders.some((o) => o.id === selectedId)}
          onClose={() => setSelectedId(null)}
          onStatus={handleStatusChange}
        />
      )}
      {printingOrder && <PrintableReceipt order={printingOrder} />}
    </div>
  );
}

function EmptyQueue() {
  const { t } = useLanguage();
  return <div className="my-8 rounded-xl border border-dashed border-border p-8 text-center"><Clock3 className="mx-auto text-muted-foreground" size={23} /><p className="mt-3 font-semibold">{t('queueClear')}</p><p className="mt-1 text-sm text-muted-foreground">{t('newRequestsHere')}</p></div>;
}

function OrderRow({ order, onClick, onPrint }: { order: Order; onClick?: () => void; onPrint?: () => void }) {
  const { language } = useLanguage();
  return <div data-testid={`row-order-${order.id}`} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-muted/50">
    <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold">{order.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{order.customerName}</p>
        <p className="mt-0.5 font-mono-ui text-[10px] text-muted-foreground">{order.orderNumber} · {order.pickupTime}</p>
      </div>
    </button>
    <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
      <a
        href={getWhatsAppLink(order, language)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={language === 'ar' ? 'إرسال إشعار واتساب للعميل' : 'Send WhatsApp update'}
        className="inline-flex items-center gap-1 rounded-lg border border-[hsl(153_28%_48%/0.4)] bg-[hsl(153_28%_48%/0.1)] px-2 py-1 text-[11px] font-bold text-[hsl(153_38%_30%)] hover:bg-[hsl(153_28%_48%/0.2)] shadow-sm transition-colors"
      >
        <MessageSquare size={13} />
        <span className="hidden sm:inline">واتساب</span>
      </a>
      {onPrint && (
        <button
          type="button"
          data-testid={`button-quick-print-${order.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onPrint();
          }}
          title={language === 'ar' ? 'طباعة إيصال العميل (72mm)' : 'Print customer receipt (72mm)'}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted shadow-sm transition-colors"
        >
          <Printer size={13} className="text-[hsl(38_74%_63%)]" />
          <span className="hidden sm:inline">{language === 'ar' ? 'طباعة' : 'Print'}</span>
        </button>
      )}
      <StatusPill status={order.status} />
      <span className="hidden font-mono-ui text-xs sm:block">{money.format(order.totalPrice)}</span>
    </div>
  </div>;
}

function OrdersPage() {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [timeframe, setTimeframe] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [startWithDepositEdit, setStartWithDepositEdit] = useState(false);
  const [quickPrintOrder, setQuickPrintOrder] = useState<Order | null>(null);

  const getTodayCairo = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };

  const getCairoDateStr = (dateVal: string | Date | undefined | null) => {
    if (!dateVal) return '';
    try {
      const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
      if (isNaN(d.getTime())) return String(dateVal).slice(0, 10);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
    } catch {
      return String(dateVal).slice(0, 10);
    }
  };

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => ({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status ? { status } : {}),
    ...(timeframe !== 'all' && timeframe !== 'custom' ? { timeframe } : {}),
    ...(customDate && timeframe === 'custom' ? { date: customDate } : {}),
  }), [debouncedSearch, status, timeframe, customDate]);

  const ordersQuery = useListOrders(params, {
    query: {
      queryKey: getListOrdersQueryKey(params),
      refetchInterval: 30_000,
    },
  });
  const exportQuery = useExportOrders({ range: 'week' }, { query: { enabled: false, queryKey: getExportOrdersQueryKey({ range: 'week' }) } });
  const updateOrder = useUpdateOrder();
  const bulkUpdateOrder = useBulkUpdateOrderStatus();
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState<OrderStatus | null>(null);
  const [isConfirmingBulk, setIsConfirmingBulk] = useState(false);
  const selectedQuery = useGetOrder(selectedId ?? 0, { query: { enabled: selectedId !== null, queryKey: getGetOrderQueryKey(selectedId ?? 0) } });
  const rawOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];

  const displayOrders = useMemo(() => {
    return rawOrders.filter((order) => {
      const todayStr = getTodayCairo();
      const createdCairo = getCairoDateStr(order.createdAt);

      if (timeframe === 'today') {
        return order.pickupDate === todayStr || createdCairo === todayStr;
      }
      if (timeframe === 'week') {
        const createdMs = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
        if (!isNaN(createdMs) && (Date.now() - createdMs) <= 7 * 86400000 && (Date.now() - createdMs) >= -86400000) {
          return true;
        }
        if (order.pickupDate) {
          const pickupMs = new Date(order.pickupDate).getTime();
          if (!isNaN(pickupMs) && pickupMs >= Date.now() - 7 * 86400000) {
            return true;
          }
        }
        return false;
      }
      if (timeframe === 'month') {
        const createdMs = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
        if (!isNaN(createdMs) && (Date.now() - createdMs) <= 31 * 86400000 && (Date.now() - createdMs) >= -86400000) {
          return true;
        }
        if (order.pickupDate) {
          const pickupMs = new Date(order.pickupDate).getTime();
          if (!isNaN(pickupMs) && pickupMs >= Date.now() - 31 * 86400000) {
            return true;
          }
        }
        return false;
      }
      if (timeframe === 'custom' && customDate) {
        return order.pickupDate === customDate || createdCairo === customDate;
      }
      return true;
    });
  }, [rawOrders, timeframe, customDate]);

  const knownOrderIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    if (Array.isArray(ordersQuery.data)) {
      const incomingIds = ordersQuery.data.map((o) => o.id);
      if (initializedRef.current) {
        const hasNew = incomingIds.some((id) => !knownOrderIdsRef.current.has(id));
        if (hasNew && localStorage.getItem('order_sound_enabled') !== 'false') {
          playOrderChime();
        }
      }
      incomingIds.forEach((id) => knownOrderIdsRef.current.add(id));
      initializedRef.current = true;
    }
  }, [ordersQuery.data]);

  useEffect(() => {
    if (!quickPrintOrder) return;
    const frame = requestAnimationFrame(() => {
      window.print();
      setQuickPrintOrder(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [quickPrintOrder]);

  const handlePrintOrder = (order: Order) => {
    setQuickPrintOrder(order);
  };

  const changeStatus = (order: Order, next: OrderStatus) =>
    updateOrder.mutate(
      { orderId: order.id, data: { status: next } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) });
        },
        onError: () => {
          alert(language === 'ar' ? 'تعذر تحديث حالة الطلب. برجاء المحاولة لاحقاً.' : 'Failed to update order status. Please try again.');
        },
      },
    );
  const exportCsv = async () => { const result = await exportQuery.refetch(); if (result.data) { const url = URL.createObjectURL(new Blob([result.data], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'saffron-seed-orders.csv'; anchor.click(); URL.revokeObjectURL(url); } };

  const allVisibleSelected = displayOrders.length > 0 && displayOrders.every((o) => selectedOrderIds.has(o.id));
  const someVisibleSelected = displayOrders.some((o) => selectedOrderIds.has(o.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedOrderIds((prev) => {
        const next = new Set(prev);
        for (const o of displayOrders) {
          next.delete(o.id);
        }
        return next;
      });
    } else {
      setSelectedOrderIds((prev) => {
        const next = new Set(prev);
        for (const o of displayOrders) {
          next.add(o.id);
        }
        return next;
      });
    }
  };

  const toggleSelectOrder = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedOrderIds(new Set());
  };

  const initiateBulkStatus = (target: OrderStatus) => {
    setBulkTargetStatus(target);
    setIsConfirmingBulk(true);
  };

  const executeBulkStatus = () => {
    if (!bulkTargetStatus || selectedOrderIds.size === 0) return;
    const orderIds = Array.from(selectedOrderIds);

    bulkUpdateOrder.mutate(
      {
        data: {
          orderIds,
          status: bulkTargetStatus,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] });
          setSelectedOrderIds(new Set());
          setIsConfirmingBulk(false);
          setBulkTargetStatus(null);
        },
        onError: () => {
          alert(language === 'ar' ? 'تعذر تحديث حالة الطلبات المحددة. برجاء المحاولة لاحقاً.' : 'Failed to update selected orders. Please try again.');
        },
      }
    );
  };

  return <div className="mx-auto max-w-[1440px]">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">{t('operations')}</p>
        <h1 className="mt-2 font-display text-4xl">{t('orderQueue')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('queueDescription')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          data-testid="button-orders-quick-pos"
          onClick={() => window.dispatchEvent(new CustomEvent('open-quick-pos'))}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all active:scale-95"
        >
          <Zap size={16} className="fill-current text-primary-foreground" />
          <span>{t('quickPosOrder')}</span>
        </button>
        <button data-testid="button-export-orders" onClick={exportCsv} disabled={exportQuery.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold">{exportQuery.isFetching ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t('exportWeek')}</button>
      </div>
    </div>

    {/* Search & Status Bar */}
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 md:flex-row">
      <div className="relative flex-1">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input data-testid="input-order-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchOrders')} className="w-full rounded-xl bg-muted py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
      </div>
      <div className="flex items-center gap-2 overflow-auto">
        <Filter size={15} className="ml-2 shrink-0 text-muted-foreground" />
        <button data-testid="button-filter-all" onClick={() => setStatus(undefined)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${!status ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{t('allOrders')}</button>
        {(['pending', 'accepted', 'preparing', 'ready', 'delivered', 'rejected'] as OrderStatus[]).map((item) => <button key={item} data-testid={`button-filter-${item}`} onClick={() => setStatus(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${status === item ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{getStatusLabel(item, language)}</button>)}
      </div>
    </div>

    {/* Timeframe & Date Search Toolbar */}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mr-1">
          <CalendarDays size={15} className="text-primary" />
          <span>{language === 'ar' ? 'تصفية بالموعد:' : 'Time Period:'}</span>
        </div>

        <button
          type="button"
          data-testid="button-timeframe-all"
          onClick={() => { setTimeframe('all'); setCustomDate(''); }}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
            timeframe === 'all'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          {language === 'ar' ? 'الكل' : 'All Time'}
        </button>

        <button
          type="button"
          data-testid="button-timeframe-today"
          onClick={() => { setTimeframe('today'); setCustomDate(''); }}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
            timeframe === 'today'
              ? 'bg-[hsl(9_54%_55%)] text-white shadow-xs'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          <Clock3 size={13} />
          <span>{language === 'ar' ? 'اليوم (Day)' : 'Today'}</span>
        </button>

        <button
          type="button"
          data-testid="button-timeframe-week"
          onClick={() => { setTimeframe('week'); setCustomDate(''); }}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
            timeframe === 'week'
              ? 'bg-[hsl(38_74%_45%)] text-white shadow-xs'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          {language === 'ar' ? 'هذا الأسبوع (Week)' : 'This Week'}
        </button>

        <button
          type="button"
          data-testid="button-timeframe-month"
          onClick={() => { setTimeframe('month'); setCustomDate(''); }}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
            timeframe === 'month'
              ? 'bg-[hsl(164_31%_25%)] text-white shadow-xs'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          {language === 'ar' ? 'هذا الشهر (Month)' : 'This Month'}
        </button>

        {/* Custom date input */}
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2.5 py-1 text-xs">
          <span className="text-[11px] text-muted-foreground">{language === 'ar' ? 'يوم محدد:' : 'Date:'}</span>
          <input
            type="date"
            value={customDate}
            onChange={(e) => {
              setCustomDate(e.target.value);
              if (e.target.value) setTimeframe('custom');
              else setTimeframe('all');
            }}
            className="bg-transparent text-xs font-bold outline-none cursor-pointer text-foreground"
          />
          {customDate && (
            <button
              type="button"
              onClick={() => { setCustomDate(''); setTimeframe('all'); }}
              className="text-muted-foreground hover:text-foreground p-0.5"
              title={language === 'ar' ? 'إلغاء تحديد التاريخ' : 'Clear date'}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Financial Metrics Summary for Filtered View */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold">
          {language === 'ar' ? 'المعروض:' : 'Showing:'}{' '}
          <strong className="text-foreground font-mono-ui font-bold">{displayOrders.length}</strong> {language === 'ar' ? 'طلب' : 'orders'}
        </span>
        <span className="text-border">|</span>
        <span>
          {language === 'ar' ? 'الإجمالي:' : 'Total:'}{' '}
          <strong className="text-primary font-mono-ui font-bold">
            {money.format(displayOrders.reduce((sum, o) => sum + o.totalPrice, 0))}
          </strong>
        </span>
        <span className="text-border">|</span>
        <span className="text-[hsl(38_74%_40%)] font-semibold">
          {language === 'ar' ? 'العربونات المحصلة:' : 'Deposits:'}{' '}
          <strong className="font-mono-ui font-bold">
            {money.format(displayOrders.reduce((sum, o) => sum + (o.depositAmount ?? 0), 0))}
          </strong>
        </span>
        <span className="text-border">|</span>
        <span className="text-[hsl(9_54%_55%)] font-semibold">
          {language === 'ar' ? 'المتبقي:' : 'Remaining:'}{' '}
          <strong className="font-mono-ui font-bold">
            {money.format(displayOrders.reduce((sum, o) => sum + (o.remainingBalance !== undefined ? o.remainingBalance : Math.max(0, o.totalPrice - (o.depositAmount ?? 0))), 0))}
          </strong>
        </span>
      </div>
    </div>

    <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
      {ordersQuery.isLoading ? <PageLoader label={t('loadingOrders')} /> : ordersQuery.isError ? <div className="p-6"><QueryError retry={() => ordersQuery.refetch()} /></div> : displayOrders.length === 0 ? <div className="p-14 text-center"><Archive className="mx-auto text-muted-foreground" size={25} /><p className="mt-3 font-display text-2xl">{t('noOrdersView')}</p><p className="mt-1 text-sm text-muted-foreground">{language === 'ar' ? 'لا توجد طلبات تطابق هذه التصفية أو التاريخ المختار.' : t('clearSearch')}</p></div> : <>
        <div className="hidden grid-cols-[38px_1.2fr_.8fr_.6fr_.65fr_.6fr_.45fr_.45fr] items-center gap-3 border-b border-border bg-muted/60 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:grid">
          <div className="flex items-center justify-center">
            <button
              type="button"
              data-testid="checkbox-select-all"
              onClick={toggleSelectAll}
              title={t('selectAllOrders')}
              className="grid size-5 place-items-center rounded-md border border-border bg-card transition-colors hover:border-primary cursor-pointer"
            >
              {allVisibleSelected ? (
                <CheckSquare size={16} className="text-primary fill-primary/10" />
              ) : someVisibleSelected ? (
                <Minus size={14} className="text-primary" />
              ) : (
                <Square size={16} className="text-muted-foreground" />
              )}
            </button>
          </div>
          <span>{t('customer')}</span>
          <span>{t('pickup')}</span>
          <span>{t('status')}</span>
          <span>{language === 'ar' ? 'السداد والعربون' : 'Payment & Deposit'}</span>
          <span className="text-right">{t('total')}</span>
          <span className="text-center">واتساب</span>
          <span className="text-center">{language === 'ar' ? 'طباعة' : 'Print'}</span>
        </div>
        <div className="divide-y divide-border">
          {displayOrders.map((order) => {
            const deposit = order.depositAmount ?? 0;
            const remaining = order.remainingBalance !== undefined ? order.remainingBalance : Math.max(0, order.totalPrice - deposit);
            const isPaid = order.paymentStatus === 'paid' || (remaining <= 0 && order.totalPrice > 0);
            const isSelected = selectedOrderIds.has(order.id);
            return (
              <div
                key={order.id}
                className={`grid gap-3 px-5 py-4 md:grid-cols-[38px_1.2fr_.8fr_.6fr_.65fr_.6fr_.45fr_.45fr] md:items-center md:gap-3 transition-colors ${
                  isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                }`}
              >
                {/* Desktop checkbox */}
                <div className="hidden md:flex items-center justify-center">
                  <button
                    type="button"
                    data-testid={`checkbox-order-${order.id}`}
                    onClick={(e) => toggleSelectOrder(order.id, e)}
                    className="grid size-5 place-items-center rounded-md border border-border bg-card transition-colors hover:border-primary cursor-pointer"
                  >
                    {isSelected ? (
                      <CheckSquare size={16} className="text-primary fill-primary/10" />
                    ) : (
                      <Square size={16} className="text-muted-foreground" />
                    )}
                  </button>
                </div>

                {/* Customer Column with mobile checkbox */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={(e) => toggleSelectOrder(order.id, e)}
                    className="grid size-5 shrink-0 place-items-center rounded-md border border-border bg-card md:hidden cursor-pointer"
                  >
                    {isSelected ? (
                      <CheckSquare size={16} className="text-primary fill-primary/10" />
                    ) : (
                      <Square size={16} className="text-muted-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    data-testid={`button-open-order-${order.id}`}
                    onClick={() => { setSelectedId(order.id); setStartWithDepositEdit(false); }}
                    className="flex min-w-0 items-center gap-3 text-left"
                  >
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold">
                      {order.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="truncate text-sm font-bold">{order.customerName}</p>
                        {(order.pickupTime?.includes('كاشير') || /^\d{3}(?:-\d+)?$/.test(order.orderNumber)) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[hsl(38_74%_63%/0.2)] text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)] text-[10px] font-bold">
                            {language === 'ar' ? 'كاشير' : 'POS'}
                            {order.orderNumber.includes('-') && (
                              <span className="opacity-80">
                                ({language === 'ar' ? `دورة ${order.orderNumber.split('-')[1]}` : `C${order.orderNumber.split('-')[1]}`})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <p className="font-mono-ui text-[10px] text-muted-foreground">{order.orderNumber} · {order.phoneNumber}</p>
                    </div>
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm md:block">
                  <CalendarDays size={14} className="text-muted-foreground md:hidden" />
                  <div className="flex flex-col">
                    <span className="font-semibold">{order.pickupDate} · {formatPickupTimeSlot(order.pickupTime, language)}</span>
                    <span className="text-[11px] text-[hsl(38_74%_55%)] font-medium">🌙 {getHijriDateInfo(order.pickupDate).formattedAr}</span>
                  </div>
                </div>
                <div>
                  <select data-testid={`select-status-${order.id}`} value={order.status} onChange={(e) => changeStatus(order, e.target.value as OrderStatus)} disabled={updateOrder.isPending} className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-bold outline-none ${statusTone[order.status]}`}>
                    <option value="pending">{getStatusLabel('pending', language)}</option>
                    <option value="accepted">{getStatusLabel('accepted', language)}</option>
                    <option value="rejected">{getStatusLabel('rejected', language)}</option>
                    <option value="preparing">{getStatusLabel('preparing', language)}</option>
                    <option value="ready">{getStatusLabel('ready', language)}</option>
                    <option value="delivered">{getStatusLabel('delivered', language)}</option>
                  </select>
                </div>
                <div>
                  {isPaid ? (
                    <span className="inline-flex items-center rounded-full bg-[hsl(153_28%_48%/0.15)] px-2.5 py-0.5 text-[10px] font-bold text-[hsl(153_38%_30%)]">
                      {language === 'ar' ? 'مدفوع بالكامل' : 'Paid in full'}
                    </span>
                  ) : deposit > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-[hsl(38_74%_63%/0.2)] px-2.5 py-0.5 text-[10px] font-bold text-[hsl(34_65%_35%)]">
                      {language === 'ar' ? `عربون: ${deposit}` : `Dep: ${deposit}`}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {language === 'ar' ? 'غير مدفوع' : 'Unpaid'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(order.id);
                      setStartWithDepositEdit(true);
                    }}
                    className="mt-1 block text-[10px] text-primary hover:underline font-bold"
                  >
                    {language === 'ar' ? (deposit > 0 ? 'تعديل العربون' : '+ تسجيل عربون') : (deposit > 0 ? 'Edit deposit' : '+ Add deposit')}
                  </button>
                </div>
                <span className="font-mono-ui text-xs font-bold md:text-right">{money.format(order.totalPrice)}</span>
                <div className="flex items-center justify-center">
                  <a
                    href={getWhatsAppLink(order, language)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={language === 'ar' ? 'إرسال إشعار واتساب للعميل' : 'Send WhatsApp message'}
                    className="inline-flex items-center gap-1 rounded-lg border border-[hsl(153_28%_48%/0.4)] bg-[hsl(153_28%_48%/0.1)] px-2.5 py-1.5 text-xs font-bold text-[hsl(153_38%_30%)] hover:bg-[hsl(153_28%_48%/0.2)] shadow-sm transition-colors"
                  >
                    <MessageSquare size={13} />
                    <span className="hidden sm:inline">واتساب</span>
                  </a>
                </div>
                <div className="flex items-center justify-end md:justify-center">
                  <button
                    type="button"
                    data-testid={`button-print-order-${order.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrintOrder(order);
                    }}
                    title={language === 'ar' ? 'طباعة إيصال العميل (72mm)' : 'Print customer receipt (72mm)'}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted shadow-sm transition-colors"
                  >
                    <Printer size={13} className="text-[hsl(38_74%_63%)]" />
                    <span>{language === 'ar' ? 'طباعة' : 'Print'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </>}
    </div>

    {/* Floating Bulk Action Dock */}
    {selectedOrderIds.size > 0 && (
      <div
        data-testid="floating-bulk-action-bar"
        className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-3 px-5 shadow-2xl backdrop-blur-md max-w-[95vw] animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground font-mono-ui">
              {selectedOrderIds.size}
            </span>
            <span className="text-xs font-bold whitespace-nowrap">
              {t('ordersSelectedCount')}
            </span>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap cursor-pointer"
          >
            {t('clearSelection')}
          </button>
        </div>

        <div className="hidden h-5 w-px bg-border sm:block" />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="hidden text-xs text-muted-foreground font-medium sm:inline whitespace-nowrap">
            {language === 'ar' ? 'تعديل الحالة إلى:' : 'Move to:'}
          </span>

          <button
            type="button"
            data-testid="bulk-action-accepted"
            onClick={() => initiateBulkStatus('accepted')}
            className="rounded-xl bg-[hsl(207_42%_88%)] px-3 py-1.5 text-xs font-bold text-[hsl(207_42%_30%)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            {getStatusLabel('accepted', language)}
          </button>

          <button
            type="button"
            data-testid="bulk-action-preparing"
            onClick={() => initiateBulkStatus('preparing')}
            className="rounded-xl bg-[hsl(38_74%_63%/0.25)] px-3 py-1.5 text-xs font-bold text-[hsl(34_65%_35%)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            {getStatusLabel('preparing', language)}
          </button>

          <button
            type="button"
            data-testid="bulk-action-ready"
            onClick={() => initiateBulkStatus('ready')}
            className="rounded-xl bg-[hsl(153_28%_48%/0.2)] px-3 py-1.5 text-xs font-bold text-[hsl(153_38%_30%)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            {getStatusLabel('ready', language)}
          </button>

          <button
            type="button"
            data-testid="bulk-action-delivered"
            onClick={() => initiateBulkStatus('delivered')}
            className="rounded-xl bg-[hsl(164_31%_18%)] px-3 py-1.5 text-xs font-bold text-[hsl(39_45%_94%)] hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
          >
            {getStatusLabel('delivered', language)}
          </button>

          <button
            type="button"
            data-testid="bulk-action-rejected"
            onClick={() => initiateBulkStatus('rejected')}
            className="rounded-xl bg-[hsl(9_54%_63%/0.15)] px-3 py-1.5 text-xs font-bold text-[hsl(9_54%_50%)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            {getStatusLabel('rejected', language)}
          </button>
        </div>
      </div>
    )}

    {/* Confirmation Modal */}
    {isConfirmingBulk && bulkTargetStatus && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl">{t('confirmBulkStatusTitle')}</h3>
            <button
              type="button"
              onClick={() => { setIsConfirmingBulk(false); setBulkTargetStatus(null); }}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-sm text-foreground">
              {t('confirmBulkStatusQuestion')}{' '}
              <strong className="font-mono-ui font-bold text-primary">{selectedOrderIds.size}</strong>{' '}
              {t('ordersTo')}{' '}
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${statusTone[bulkTargetStatus]}`}>
                {getStatusLabel(bulkTargetStatus, language)}
              </span>
              ؟
            </p>

            {bulkTargetStatus === 'rejected' && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle size={15} />
                  <span>{t('rejectStockRefundNotice')}</span>
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={bulkUpdateOrder.isPending}
              onClick={() => { setIsConfirmingBulk(false); setBulkTargetStatus(null); }}
              className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-muted cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              data-testid="button-confirm-bulk-apply"
              disabled={bulkUpdateOrder.isPending}
              onClick={executeBulkStatus}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {bulkUpdateOrder.isPending && <Loader2 size={14} className="animate-spin" />}
              <span>{t('confirmAndApply')}</span>
            </button>
          </div>
        </div>
      </div>
    )}

    {selectedId !== null && (
      <OrderDetail
        order={selectedQuery.data || displayOrders.find((o) => o.id === selectedId)}
        isLoading={selectedQuery.isLoading && !displayOrders.some((o) => o.id === selectedId)}
        onClose={() => { setSelectedId(null); setStartWithDepositEdit(false); }}
        onStatus={changeStatus}
        startEditingDeposit={startWithDepositEdit}
      />
    )}
    {quickPrintOrder && <PrintableReceipt order={quickPrintOrder} />}
  </div>;
}

function parseCleanAmount(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, val);
  if (!val) return 0;
  const cleaned = String(val)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٫|,/g, '.')
    .replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.max(0, n);
}

function OrderDetail({
  order,
  isLoading,
  onClose,
  onStatus,
  startEditingDeposit = false,
}: {
  order?: Order;
  isLoading: boolean;
  onClose: () => void;
  onStatus: (order: Order, status: OrderStatus) => void;
  startEditingDeposit?: boolean;
}) {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const updateOrder = useUpdateOrder();

  const deposit = order?.depositAmount ?? 0;
  const remaining = order ? (order.remainingBalance !== undefined ? order.remainingBalance : Math.max(0, order.totalPrice - deposit)) : 0;
  const isPaid = order ? (order.paymentStatus === 'paid' || (remaining <= 0 && order.totalPrice > 0)) : false;

  const [isEditingDeposit, setIsEditingDeposit] = useState(startEditingDeposit);
  const [depositInput, setDepositInput] = useState<string>(order ? String(order.depositAmount ?? 0) : '0');
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>(order?.paymentMethod || 'cash');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (startEditingDeposit) {
      setIsEditingDeposit(true);
    }
  }, [startEditingDeposit]);

  useEffect(() => {
    if (order && !isEditingDeposit) {
      setDepositInput(String(order.depositAmount ?? 0));
      setPaymentMethodInput(order.paymentMethod || 'cash');
    }
  }, [order?.id, order?.depositAmount, order?.paymentMethod, isEditingDeposit]);

  const handleMarkPaid = () => {
    if (!order) return;
    setSaveStatus('idle');
    setErrorMessage('');
    updateOrder.mutate(
      {
        orderId: order.id,
        data: {
          depositAmount: order.totalPrice,
          remainingBalance: 0,
          paymentStatus: 'paid',
        },
      },
      {
        onSuccess: (updated) => {
          setSaveStatus('success');
          setIsEditingDeposit(false);
          setDepositInput(String(order.totalPrice));
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) });
          queryClient.invalidateQueries({ queryKey: ['/api/orders', order.id] });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          if (updated) {
            queryClient.setQueryData(getGetOrderQueryKey(order.id), updated);
          }
          setTimeout(() => setSaveStatus('idle'), 3000);
        },
        onError: (err: any) => {
          setSaveStatus('error');
          setErrorMessage(
            err?.data?.error ||
            (language === 'ar' ? 'تعذر تسجيل السداد بالكامل. يرجى المحاولة مرة أخرى.' : 'Failed to mark fully paid. Please try again.')
          );
        },
      },
    );
  };

  const handleSaveDeposit = () => {
    if (!order) return;
    const parsedDep = parseCleanAmount(depositInput);
    const numDep = Math.min(order.totalPrice, Math.max(0, parsedDep));
    const numRem = Math.max(0, order.totalPrice - numDep);
    const newStatus = numDep >= order.totalPrice && order.totalPrice > 0 ? 'paid' : numDep > 0 ? 'partially_paid' : 'unpaid';

    setSaveStatus('idle');
    setErrorMessage('');

    updateOrder.mutate(
      {
        orderId: order.id,
        data: {
          depositAmount: numDep,
          remainingBalance: numRem,
          paymentMethod: paymentMethodInput,
          paymentStatus: newStatus,
        },
      },
      {
        onSuccess: (updated) => {
          setSaveStatus('success');
          setIsEditingDeposit(false);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) });
          queryClient.invalidateQueries({ queryKey: ['/api/orders', order.id] });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          if (updated) {
            queryClient.setQueryData(getGetOrderQueryKey(order.id), updated);
          }
          setTimeout(() => setSaveStatus('idle'), 3000);
        },
        onError: (err: any) => {
          setSaveStatus('error');
          setErrorMessage(
            err?.data?.error ||
            (language === 'ar' ? 'تعذر حفظ العربون. يرجى المحاولة مرة أخرى.' : 'Failed to save deposit. Please try again.')
          );
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(164_31%_18%/0.35)] p-0 sm:items-center sm:p-5">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-3xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t('orderDetail')}</p>
          {order && <h2 className="mt-1 font-display text-3xl">{order.orderNumber}</h2>}
        </div>
        <button data-testid="button-close-order-detail" onClick={onClose} className="rounded-xl border border-border p-2" aria-label="إغلاق">
          <X size={17} />
        </button>
      </div>

      {isLoading ? (
        <PageLoader label={t('loadingOrders')} />
      ) : order ? (
        <>
          <div className="mt-6 rounded-2xl bg-muted p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold">{order.customerName}</span>
              <StatusPill status={order.status} />
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Phone size={13} /> {order.phoneNumber}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays size={13} /> {formatDualDate(order.pickupDate, language)} — {formatPickupTimeSlot(order.pickupTime, language)}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.quantity} {getUnitLabel(item.unit, language)} · {item.categoryName}</span>
                <span className="font-mono-ui text-xs">{money.format(item.subtotal)}</span>
              </div>
            ))}
          </div>

          {order.notes && (
            <div className="mt-5 border-r-2 border-[hsl(38_74%_63%)] pr-3 text-sm italic text-muted-foreground">
              “{order.notes}”
            </div>
          )}

          {/* Financial Breakdown Section & Deposit Management */}
          <div className="mt-5 rounded-2xl border border-border bg-card p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center text-sm font-bold">
              <span>{t('total')}</span>
              <span className="font-display text-xl text-primary">{money.format(order.totalPrice)}</span>
            </div>

            <div className="flex justify-between items-center text-muted-foreground">
              <span>{language === 'ar' ? 'العربون المدفوع:' : 'Deposit Paid:'}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono-ui font-bold text-sm text-[hsl(38_74%_45%)]">{money.format(deposit)}</span>
                <button
                  type="button"
                  data-testid="button-toggle-deposit-editor"
                  onClick={() => setIsEditingDeposit(!isEditingDeposit)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground hover:bg-muted/80 shadow-2xs"
                >
                  <Pencil size={11} />
                  <span>{language === 'ar' ? (deposit > 0 ? 'تعديل العربون' : 'تسجيل عربون') : (deposit > 0 ? 'Edit Deposit' : 'Add Deposit')}</span>
                </button>
              </div>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>{language === 'ar' ? 'المتبقي للاستلام:' : 'Remaining Balance:'}</span>
              <span className={`font-mono-ui font-bold text-sm ${remaining > 0 ? 'text-[hsl(9_54%_55%)]' : 'text-[hsl(153_38%_30%)]'}`}>
                {money.format(remaining)}
              </span>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>{language === 'ar' ? 'طريقة الدفع:' : 'Payment Method:'}</span>
              <span className="font-semibold">{getPaymentMethodLabel(order.paymentMethod, language)}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span>{language === 'ar' ? 'حالة السداد:' : 'Payment Status:'}</span>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 font-bold ${isPaid ? 'bg-[hsl(153_28%_48%/0.15)] text-[hsl(153_38%_30%)]' : 'bg-[hsl(38_74%_63%/0.2)] text-[hsl(34_65%_35%)]'}`}>
                  {getPaymentStatusLabel(order.paymentStatus || (isPaid ? 'paid' : deposit > 0 ? 'partially_paid' : 'unpaid'), language)}
                </span>
                {!isPaid && (
                  <button
                    type="button"
                    onClick={handleMarkPaid}
                    disabled={updateOrder.isPending}
                    className="rounded-lg bg-[hsl(153_28%_48%)] px-2.5 py-1 text-[10px] font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {language === 'ar' ? 'تسجيل سداد المتبقي بالكامل' : 'Mark Fully Paid'}
                  </button>
                )}
              </div>
            </div>

            {/* Status alerts */}
            {saveStatus === 'success' && (
              <div className="mt-2 rounded-xl bg-[hsl(153_28%_48%/0.15)] border border-[hsl(153_28%_48%/0.3)] p-2.5 text-xs text-[hsl(153_38%_30%)] font-bold flex items-center gap-2">
                <Check size={14} />
                <span>{language === 'ar' ? 'تم حفظ بيانات العربون بنجاح!' : 'Deposit saved successfully!'}</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="mt-2 rounded-xl bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive font-bold flex items-center gap-2">
                <AlertCircle size={14} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Interactive Deposit Editor */}
            {isEditingDeposit && (
              <div className="mt-3 rounded-xl border-2 border-[hsl(38_74%_63%/0.5)] bg-[hsl(38_74%_63%/0.08)] p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
                    <Wallet size={14} className="text-[hsl(38_74%_63%)]" />
                    {language === 'ar' ? 'تحديد مبلغ العربون وطريقة التحصيل' : 'Set Deposit Amount & Payment Method'}
                  </span>
                  <button type="button" onClick={() => setIsEditingDeposit(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    {language === 'ar' ? 'مبلغ العربون (جنيه مصري):' : 'Deposit Amount (EGP):'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={depositInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const normalized = raw
                          .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                          .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
                          .replace(/٫|,/g, ".");
                        setDepositInput(normalized);
                      }}
                      placeholder="0"
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold font-mono-ui outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                      {language === 'ar' ? 'ج.م' : 'EGP'}
                    </span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDepositInput(String(Math.round(order.totalPrice * 0.25)))}
                    className="rounded-md border border-border/80 bg-card px-2 py-1 text-[10px] font-bold hover:bg-muted"
                  >
                    25% ({Math.round(order.totalPrice * 0.25)} ج)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositInput(String(Math.round(order.totalPrice * 0.5)))}
                    className="rounded-md border border-border/80 bg-card px-2 py-1 text-[10px] font-bold hover:bg-muted"
                  >
                    50% ({Math.round(order.totalPrice * 0.5)} ج)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositInput(String(order.totalPrice))}
                    className="rounded-md border border-[hsl(153_28%_48%/0.5)] bg-[hsl(153_28%_48%/0.1)] px-2 py-1 text-[10px] font-bold text-[hsl(153_38%_30%)] hover:bg-[hsl(153_28%_48%/0.2)]"
                  >
                    {language === 'ar' ? 'كامل المبلغ (100%)' : 'Full (100%)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositInput('0')}
                    className="rounded-md border border-border/80 bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted"
                  >
                    {language === 'ar' ? 'بدون عربون (0)' : 'No Deposit (0)'}
                  </button>
                </div>

                {/* Payment Method Selector */}
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    {language === 'ar' ? 'طريقة تحصيل العربون:' : 'Payment Method:'}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'cash', ar: 'نقداً', en: 'Cash' },
                      { id: 'instapay', ar: 'إنستاباي (InstaPay)', en: 'InstaPay' },
                      { id: 'vodafone_cash', ar: 'فودافون كاش', en: 'Vodafone Cash' },
                      { id: 'card', ar: 'فيزا / بطاقة', en: 'Card / POS' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethodInput(m.id)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all text-center ${
                          paymentMethodInput === m.id
                            ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                            : 'border-border bg-card text-foreground hover:bg-muted'
                        }`}
                      >
                        {language === 'ar' ? m.ar : m.en}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calculation Preview */}
                {(() => {
                  const parsedDep = parseCleanAmount(depositInput);
                  const numDep = Math.min(order.totalPrice, Math.max(0, parsedDep));
                  const numRem = Math.max(0, order.totalPrice - numDep);
                  return (
                    <div className="rounded-lg bg-card p-2.5 text-[11px] space-y-1 border border-border/70">
                      <div className="flex justify-between">
                        <span>{language === 'ar' ? 'المبلغ المحصل كعربون:' : 'Deposit Collected:'}</span>
                        <span className="font-mono-ui font-bold text-[hsl(38_74%_45%)]">{money.format(numDep)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{language === 'ar' ? 'المتبقي مطلوب تحصيله عند الاستلام:' : 'Remaining to Collect:'}</span>
                        <span className={`font-mono-ui font-bold ${numRem > 0 ? 'text-[hsl(9_54%_55%)]' : 'text-[hsl(153_38%_30%)]'}`}>
                          {money.format(numRem)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Save Deposit Button */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="button-save-deposit"
                    onClick={handleSaveDeposit}
                    disabled={updateOrder.isPending}
                    className="flex-1 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm"
                  >
                    {updateOrder.isPending
                      ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                      : (language === 'ar' ? 'تأكيد وحفظ العربون' : 'Confirm & Save Deposit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingDeposit(false)}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-5 flex flex-wrap gap-2">
            {order.status === 'pending' && <button data-testid="button-accept-order" onClick={() => onStatus(order, 'accepted')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{t('accept')}</button>}
            {order.status === 'accepted' && <button data-testid="button-start-order" onClick={() => onStatus(order, 'preparing')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{t('startPreparing')}</button>}
            {order.status === 'preparing' && <button data-testid="button-mark-ready" onClick={() => onStatus(order, 'ready')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{t('markReady')}</button>}
            {order.status === 'ready' && <button data-testid="button-mark-collected" onClick={() => onStatus(order, 'delivered')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{t('markCollected')}</button>}
            <button data-testid="button-decline-order" onClick={() => onStatus(order, 'rejected')} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-[hsl(3_58%_42%)]">{t('decline')}</button>
            <a
              href={getWhatsAppLink(order, language)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(153_28%_48%/0.5)] bg-[hsl(153_28%_48%/0.12)] px-4 py-2.5 text-sm font-bold text-[hsl(153_38%_30%)] hover:bg-[hsl(153_28%_48%/0.25)] shadow-sm"
            >
              <MessageSquare size={16} />
              <span>{language === 'ar' ? 'إرسال إشعار واتساب' : 'WhatsApp'}</span>
            </a>
            <button type="button" data-testid="button-print-order-receipt" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 shadow-sm">
              <Printer size={15} /> <span>{language === 'ar' ? 'طباعة إيصال العميل (72mm)' : 'Print Receipt (72mm)'}</span>
            </button>
          </div>
          <PrintableReceipt order={order} />
        </>
      ) : (
        <QueryError />
      )}
    </div>
  </div>
  );
}

function KitchenPage() {
  const { language } = useLanguage();
  const getTodayDate = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  const getTomorrowDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };

  const today = getTodayDate();
  const tomorrow = getTomorrowDate();
  const [sightingOffset] = useHijriOffset();
  const eidMilestones = useMemo(() => getUpcomingEidMilestones(today, sightingOffset), [today, sightingOffset]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [printingKitchenSlip, setPrintingKitchenSlip] = useState(false);

  const ordersQuery = useListOrders({ date: selectedDate });
  const allOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];
  const productionOrders = allOrders.filter((o) => ['pending', 'accepted', 'preparing', 'ready'].includes(o.status));

  // Aggregate quantities by sweet category
  const itemMap = new Map<string, { categoryName: string; unit: string; totalQty: number; orderCount: number }>();
  for (const order of productionOrders) {
    for (const item of order.items) {
      const existing = itemMap.get(item.categoryName) || {
        categoryName: item.categoryName,
        unit: item.unit,
        totalQty: 0,
        orderCount: 0,
      };
      existing.totalQty += item.quantity;
      existing.orderCount += 1;
      itemMap.set(item.categoryName, existing);
    }
  }

  const aggregatedItems = [...itemMap.values()].sort((a, b) => b.totalQty - a.totalQty);

  const handlePrintSlip = () => {
    setPrintingKitchenSlip(true);
    setTimeout(() => {
      window.print();
      setPrintingKitchenSlip(false);
    }, 50);
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">
            {language === 'ar' ? 'المعمل والخبيز' : 'Kitchen & Production'}
          </p>
          <h1 className="mt-2 font-display text-4xl">
            {language === 'ar' ? 'تشغيل المعمل وتجهيز العلب' : 'Kitchen Production Sheet'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {language === 'ar'
              ? 'تقرير مجمع بالكميات الإجمالية المطلوبة للخبيز والتعبئة حسب تاريخ الاستلام.'
              : 'Aggregated quantities required for baking and packing by pickup date.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handlePrintSlip}
          disabled={productionOrders.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40 shadow-sm"
        >
          <Printer size={16} />
          <span>{language === 'ar' ? 'طباعة إذن تشغيل المعمل' : 'Print Kitchen Slip'}</span>
        </button>
      </div>

      {/* Date Filter Bar */}
      <div className="mt-8 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-4">
        <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          <CalendarDays size={15} />
          {language === 'ar' ? 'تاريخ تشغيل المعمل:' : 'Production Date:'}
        </span>
        <button
          type="button"
          onClick={() => setSelectedDate(today)}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
            selectedDate === today
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'border border-border hover:bg-muted'
          }`}
        >
          {language === 'ar' ? 'اليوم' : 'Today'} ({today})
        </button>
        <button
          type="button"
          onClick={() => setSelectedDate(tomorrow)}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
            selectedDate === tomorrow
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'border border-border hover:bg-muted'
          }`}
        >
          {language === 'ar' ? 'غدًا' : 'Tomorrow'} ({tomorrow})
        </button>

        {eidMilestones.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedDate(m.isoDate)}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition-all flex items-center gap-1.5 ${
              selectedDate === m.isoDate
                ? 'bg-[hsl(38_74%_63%)] text-[hsl(164_31%_18%)] shadow-xs font-bold ring-1 ring-[hsl(38_74%_63%)]'
                : 'border border-[hsl(38_74%_63%/0.4)] bg-[hsl(38_74%_63%/0.08)] hover:bg-[hsl(38_74%_63%/0.18)] text-foreground'
            }`}
          >
            <span>🌙</span>
            <span>{language === 'ar' ? m.titleAr : m.titleEn}</span>
          </button>
        ))}

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="rounded-xl border border-input bg-background px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-primary"
        />

        <span className="rounded-full bg-[hsl(38_74%_63%/0.15)] px-3 py-1 text-xs font-bold text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)] flex items-center gap-1">
          <span>🌙</span>
          <span>{formatDualDate(selectedDate, language, sightingOffset)}</span>
        </span>

        <span className="ml-auto text-xs font-semibold text-muted-foreground">
          {language === 'ar'
            ? `إجمالي الطلبات المقررة: ${productionOrders.length} طلب`
            : `Scheduled orders: ${productionOrders.length}`}
        </span>
      </div>

      {/* Aggregated Totals Grid */}
      <div className="mt-8">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <ChefHat size={17} className="text-[hsl(38_74%_63%)]" />
          <span>{language === 'ar' ? 'إجمالي الكميات المطلوبة للخبيز والتجهيز' : 'Total Quantities Required for Baking & Packing'}</span>
        </h2>

        {ordersQuery.isLoading ? (
          <PageLoader label={language === 'ar' ? 'جاري تجميع طلبيات المعمل' : 'Calculating kitchen batches'} />
        ) : aggregatedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            {language === 'ar'
              ? 'لا توجد طلبات تشغيل مسجلة لموعد هذا اليوم.'
              : 'No orders scheduled for kitchen preparation on this date.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aggregatedItems.map((item) => (
              <div
                key={item.categoryName}
                className="lift rounded-2xl border border-border bg-card p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-lg">{item.categoryName}</h3>
                    <span className="rounded-full bg-[hsl(38_74%_63%/0.2)] px-2.5 py-0.5 text-xs font-bold text-[hsl(34_65%_35%)]">
                      {item.orderCount} {language === 'ar' ? 'طلب' : 'orders'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {language === 'ar' ? 'الكمية الإجمالية المطلوبة:' : 'Total Required Quantity:'}
                  </p>
                </div>
                <div className="mt-6 flex items-baseline justify-between border-t border-border pt-4">
                  <span className="font-display text-4xl text-primary font-bold">
                    {item.totalQty}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">
                    {getUnitLabel(item.unit, language)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Individual Order Pack List */}
      {productionOrders.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ClipboardList size={16} />
            <span>{language === 'ar' ? 'قائمة علب وحزم الزبائن المجدولة' : 'Scheduled Customer Order Boxes'}</span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
            {productionOrders.map((order) => (
              <div key={order.id} className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{order.orderNumber}</span>
                    <span className="font-semibold text-sm">{order.customerName}</span>
                    <StatusPill status={order.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ⏰ {order.pickupTime} · 📞 {order.phoneNumber}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {order.items.map((it) => (
                      <span key={it.id} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold">
                        {it.quantity} {getUnitLabel(it.unit, language)} × {it.categoryName}
                      </span>
                    ))}
                  </div>
                  {order.notes && (
                    <p className="mt-2 text-xs italic text-[hsl(38_74%_63%)]">“{order.notes}”</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Printable Kitchen Slip */}
      {printingKitchenSlip && typeof document !== 'undefined' && createPortal(
        <article className="print-receipt" dir="rtl">
          <div className="receipt-header">
            <h1>حلويات فتوح — المعمل</h1>
            <p>إذن تشغيل وخبيز يوم: {formatDualDate(selectedDate, 'ar', sightingOffset)}</p>
          </div>
          <div className="receipt-meta">
            <div><span>التاريخ</span><strong>{formatDualDate(selectedDate, 'ar', sightingOffset)}</strong></div>
            <div><span>عدد الطلبات</span><strong>{productionOrders.length} طلب</strong></div>
          </div>
          <table>
            <thead>
              <tr><th>الصنف</th><th>إجمالي الكمية</th><th>عدد الطلبات</th></tr>
            </thead>
            <tbody>
              {aggregatedItems.map((item) => (
                <tr key={item.categoryName}>
                  <td><strong>{item.categoryName}</strong></td>
                  <td><strong>{item.totalQty} {unitLabelsAr[item.unit] || item.unit}</strong></td>
                  <td>{item.orderCount} طلب</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="receipt-footer">قسم الإنتاج والتجهيز — حلويات فتوح</p>
        </article>,
        document.body,
      )}
    </div>
  );
}

function StockDemandPage() {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const categoriesQuery = useListCategories();
  const ordersQuery = useListOrders(undefined, {
    query: {
      queryKey: getListOrdersQueryKey(),
      refetchInterval: 15_000,
    },
  });
  const updateCategory = useUpdateCategory();

  const getTodayDate = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  const getTomorrowDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };

  const todayStr = getTodayDate();
  const tomorrowStr = getTomorrowDate();
  const [sightingOffset] = useHijriOffset();
  const eidMilestones = useMemo(() => getUpcomingEidMilestones(todayStr, sightingOffset), [todayStr, sightingOffset]);

  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow' | string>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [filterDeficitsOnly, setFilterDeficitsOnly] = useState<boolean>(false);

  // Quick Restock Dialog state
  const [restockTarget, setRestockTarget] = useState<{
    category: Category;
    unit: 'kilo' | 'half_kilo' | 'box' | 'piece';
  } | null>(null);
  const [restockAmount, setRestockAmount] = useState<string>('');

  // Drill-down Drawer state
  const [drillDownTarget, setDrillDownTarget] = useState<{
    categoryName: string;
    unit: string;
    orders: Array<{ order: Order; quantity: number }>;
  } | null>(null);

  const allOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];
  const categories = Array.isArray(categoriesQuery.data) ? categoriesQuery.data : [];
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Active unfulfilled orders only
  const activeOrders = useMemo(() => {
    return allOrders.filter((o) => ['pending', 'accepted', 'preparing', 'ready'].includes(o.status));
  }, [allOrders]);

  // Filtered orders by date
  const filteredOrders = useMemo(() => {
    if (dateFilter === 'all') return activeOrders;
    if (dateFilter === 'today') return activeOrders.filter((o) => o.pickupDate === todayStr);
    if (dateFilter === 'tomorrow') return activeOrders.filter((o) => o.pickupDate === tomorrowStr);
    return activeOrders.filter((o) => o.pickupDate === dateFilter);
  }, [activeOrders, dateFilter, todayStr, tomorrowStr]);

  // Build demand aggregates partitioned by categoryId and unit
  const { kiloDemandMap, halfKiloDemandMap, regularDemandMap } = useMemo(() => {
    const kiloMap = new Map<number, { total: number; orders: Array<{ order: Order; quantity: number }> }>();
    const halfKiloMap = new Map<number, { total: number; orders: Array<{ order: Order; quantity: number }> }>();
    const regMap = new Map<number, { total: number; orders: Array<{ order: Order; quantity: number }> }>();

    for (const order of filteredOrders) {
      for (const item of order.items) {
        const catId = item.categoryId;
        const parentCat = catMap.get(catId);
        const isKiloCat = parentCat?.unit === 'kilo';

        if (item.unit === 'half_kilo') {
          const entry = halfKiloMap.get(catId) || { total: 0, orders: [] };
          entry.total += item.quantity;
          entry.orders.push({ order, quantity: item.quantity });
          halfKiloMap.set(catId, entry);
        } else if (item.unit === 'kilo' || (isKiloCat && !item.unit)) {
          const entry = kiloMap.get(catId) || { total: 0, orders: [] };
          entry.total += item.quantity;
          entry.orders.push({ order, quantity: item.quantity });
          kiloMap.set(catId, entry);
        } else {
          // If no unit or piece/box, treat as regular / default
          const entry = regMap.get(catId) || { total: 0, orders: [] };
          entry.total += item.quantity;
          entry.orders.push({ order, quantity: item.quantity });
          regMap.set(catId, entry);
        }
      }
    }
    return { kiloDemandMap: kiloMap, halfKiloDemandMap: halfKiloMap, regularDemandMap: regMap };
  }, [filteredOrders, catMap]);

  // Calculate comparisons for each category
  const comparisonList = useMemo(() => {
    return categories.map((cat) => {
      const isKilo = cat.unit === 'kilo';

      if (isKilo) {
        const kiloStock = Number(cat.stockQuantity) || 0;
        const kiloData = kiloDemandMap.get(cat.id);
        const kiloDemand = kiloData?.total || 0;
        const kiloOrders = kiloData?.orders || [];
        const kiloBalance = kiloStock - kiloDemand;
        const kiloDeficit = kiloBalance < 0 ? Math.abs(kiloBalance) : 0;

        const halfKiloStock = Number(cat.halfKiloStock) || 0;
        const halfKiloData = halfKiloDemandMap.get(cat.id);
        const halfKiloDemand = halfKiloData?.total || 0;
        const halfKiloOrders = halfKiloData?.orders || [];
        const halfKiloBalance = halfKiloStock - halfKiloDemand;
        const halfKiloDeficit = halfKiloBalance < 0 ? Math.abs(halfKiloBalance) : 0;

        const hasDeficit = kiloDeficit > 0 || halfKiloDeficit > 0;

        return {
          category: cat,
          isKilo: true,
          kiloStock,
          kiloDemand,
          kiloBalance,
          kiloDeficit,
          kiloOrders,
          halfKiloStock,
          halfKiloDemand,
          halfKiloBalance,
          halfKiloDeficit,
          halfKiloOrders,
          stock: kiloStock,
          demand: kiloDemand,
          balance: kiloBalance,
          deficit: kiloDeficit,
          orders: kiloOrders,
          hasDeficit,
        };
      } else {
        const stock = Number(cat.stockQuantity) || 0;
        const regData = regularDemandMap.get(cat.id);
        const demand = regData?.total || 0;
        const orders = regData?.orders || [];
        const balance = stock - demand;
        const deficit = balance < 0 ? Math.abs(balance) : 0;
        const hasDeficit = deficit > 0;

        return {
          category: cat,
          isKilo: false,
          kiloStock: stock,
          kiloDemand: demand,
          kiloBalance: balance,
          kiloDeficit: deficit,
          kiloOrders: orders,
          halfKiloStock: 0,
          halfKiloDemand: 0,
          halfKiloBalance: 0,
          halfKiloDeficit: 0,
          halfKiloOrders: [] as Array<{ order: Order; quantity: number }>,
          stock,
          demand,
          balance,
          deficit,
          orders,
          hasDeficit,
        };
      }
    });
  }, [categories, kiloDemandMap, halfKiloDemandMap, regularDemandMap]);

  // Summary KPI statistics
  const kpis = useMemo(() => {
    let deficitCategoriesCount = 0;
    let totalKilosDemanded = 0;
    let totalHalfKilosDemanded = 0;
    let totalDeficitKilos = 0;

    for (const c of comparisonList) {
      if (c.hasDeficit) deficitCategoriesCount += 1;
      if (c.isKilo) {
        totalKilosDemanded += c.kiloDemand;
        totalHalfKilosDemanded += c.halfKiloDemand;
        totalDeficitKilos += c.kiloDeficit + c.halfKiloDeficit * 0.5;
      } else {
        totalDeficitKilos += c.deficit;
      }
    }

    return {
      deficitCategoriesCount,
      totalActiveOrders: filteredOrders.length,
      totalKilosDemanded,
      totalHalfKilosDemanded,
      totalDeficitKilos,
    };
  }, [comparisonList, filteredOrders]);

  // Filtered displayed categories by search and deficits filter
  const displayedCategories = useMemo(() => {
    return comparisonList.filter((item) => {
      if (filterDeficitsOnly && !item.hasDeficit) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return item.category.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [comparisonList, filterDeficitsOnly, search]);

  const handleOpenRestock = (category: Category, unit: 'kilo' | 'half_kilo' | 'box' | 'piece') => {
    setRestockTarget({ category, unit });
    setRestockAmount('');
  };

  const handleConfirmRestock = () => {
    if (!restockTarget) return;
    const qtyToAdd = parseFloat(restockAmount);
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
      alert(language === 'ar' ? 'يرجى إدخال كمية إنتاج صحيحة أكبر من الصفر' : 'Please enter a valid production amount greater than 0');
      return;
    }

    const { category, unit } = restockTarget;
    let patchData: { stockQuantity?: number; halfKiloStock?: number } = {};

    if (unit === 'half_kilo') {
      const current = Number(category.halfKiloStock) || 0;
      patchData = { halfKiloStock: current + qtyToAdd };
    } else {
      const current = Number(category.stockQuantity) || 0;
      patchData = { stockQuantity: current + qtyToAdd };
    }

    updateCategory.mutate(
      { categoryId: category.id, data: patchData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          setRestockTarget(null);
          setRestockAmount('');
        },
        onError: () => {
          alert(language === 'ar' ? 'تعذر تحديث المخزون، يرجى المحاولة مرة أخرى' : 'Failed to update stock, please try again');
        },
      },
    );
  };

  if (categoriesQuery.isLoading || ordersQuery.isLoading) {
    return <PageLoader label={language === 'ar' ? 'جاري حساب ميزان المخزون والطلبيات...' : 'Calculating stock vs demand balance...'} />;
  }

  if (categoriesQuery.isError || ordersQuery.isError) {
    return (
      <div className="mx-auto max-w-[1440px] py-12">
        <QueryError
          retry={() => {
            categoriesQuery.refetch();
            ordersQuery.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">
            {t('stockDemand')}
          </p>
          <h1 className="mt-2 font-display text-4xl">{t('stockDemand')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('stockDemandSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/kitchen"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted shadow-sm transition-colors"
          >
            <ChefHat size={15} className="text-[hsl(38_74%_63%)]" />
            <span>{language === 'ar' ? 'فتح إذن تشغيل المعمل' : 'Open Kitchen Sheet'}</span>
          </Link>
          <Link
            href="/admin/categories"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted shadow-sm transition-colors"
          >
            <Package size={15} className="text-primary" />
            <span>{t('categoriesStock')}</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Deficit Sweets Alert Card */}
        <div
          className={`rounded-2xl border p-5 transition-all shadow-xs ${
            kpis.deficitCategoriesCount > 0
              ? 'border-destructive/40 bg-destructive/10'
              : 'border-[hsl(153_28%_48%/0.3)] bg-[hsl(153_28%_48%/0.08)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('deficitItems')}
            </span>
            {kpis.deficitCategoriesCount > 0 ? (
              <span className="grid size-8 place-items-center rounded-xl bg-destructive text-white shadow-xs">
                <AlertCircle size={17} />
              </span>
            ) : (
              <span className="grid size-8 place-items-center rounded-xl bg-[hsl(153_28%_48%)] text-white shadow-xs">
                <Check size={17} />
              </span>
            )}
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className={`font-display text-4xl font-bold ${
                kpis.deficitCategoriesCount > 0 ? 'text-destructive' : 'text-[hsl(153_38%_30%)] dark:text-[hsl(153_48%_65%)]'
              }`}
            >
              {kpis.deficitCategoriesCount}
            </span>
            <span className="text-xs text-muted-foreground">
              {language === 'ar' ? 'صنف به عجز' : 'sweets in deficit'}
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            {kpis.deficitCategoriesCount > 0
              ? language === 'ar'
                ? `مطلوب خبيز وتجهيز ما يقرب من ${kpis.totalDeficitKilos} كجم إضافية لتغطية الحجوزات`
                : `Need to bake approx ${kpis.totalDeficitKilos} kg to fulfill active reservations`
              : language === 'ar'
                ? 'جميع الأصناف مغطاة بالكامل بالمخزون المتوفر ✨'
                : 'All sweets are fully covered by stock ✨'}
          </p>
        </div>

        {/* Monitored Active Orders */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('allActiveOrders')}
            </span>
            <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <ClipboardList size={17} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold">{kpis.totalActiveOrders}</span>
            <span className="text-xs text-muted-foreground">{language === 'ar' ? 'طلب نشط' : 'active orders'}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {language === 'ar' ? 'طلبات قيد الانتظار، مقبولة وجاري تجهيزها' : 'Pending, accepted, and in-prep orders'}
          </p>
        </div>

        {/* Total 1 kg Demanded */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('totalKilosDemanded')}
            </span>
            <span className="grid size-8 place-items-center rounded-xl bg-[hsl(38_74%_63%/0.2)] text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)]">
              <Scale size={17} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold text-primary">{kpis.totalKilosDemanded}</span>
            <span className="text-xs font-bold text-muted-foreground">{t('kiloUnit')}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {language === 'ar' ? 'مجموع عبوات الكيلو المطلوب تجهيزها' : 'Total 1 kg packs demanded'}
          </p>
        </div>

        {/* Total 0.5 kg Demanded */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('totalHalfKilosDemanded')}
            </span>
            <span className="grid size-8 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Package size={17} />
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold text-amber-600 dark:text-amber-400">{kpis.totalHalfKilosDemanded}</span>
            <span className="text-xs font-bold text-muted-foreground">{t('halfKiloUnit')}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {language === 'ar' ? 'مجموع عبوات نصف الكيلو المطلوب تجهيزها' : 'Total 0.5 kg packs demanded'}
          </p>
        </div>
      </div>

      {/* Filter and Date Bar */}
      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        {/* Date Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mr-1">
            <CalendarDays size={15} className="text-primary" />
            <span>{language === 'ar' ? 'موعد الاستلام:' : 'Pickup Scope:'}</span>
          </span>
          <button
            type="button"
            data-testid="button-date-all"
            onClick={() => { setDateFilter('all'); setCustomDate(''); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              dateFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {language === 'ar' ? 'كل الطلبات النشطة' : 'All Active'}
          </button>
          <button
            type="button"
            data-testid="button-date-today"
            onClick={() => { setDateFilter('today'); setCustomDate(''); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
              dateFilter === 'today'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            <Clock3 size={13} />
            <span>{language === 'ar' ? 'اليوم' : 'Today'} ({todayStr})</span>
          </button>
          <button
            type="button"
            data-testid="button-date-tomorrow"
            onClick={() => { setDateFilter('tomorrow'); setCustomDate(''); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              dateFilter === 'tomorrow'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {language === 'ar' ? 'غداً' : 'Tomorrow'} ({tomorrowStr})
          </button>

          {eidMilestones.map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`button-date-${m.id}`}
              onClick={() => { setDateFilter(m.isoDate); setCustomDate(''); }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                dateFilter === m.isoDate
                  ? 'bg-[hsl(38_74%_63%)] text-[hsl(164_31%_18%)] shadow-xs ring-1 ring-[hsl(38_74%_63%)]'
                  : 'border border-[hsl(38_74%_63%/0.4)] bg-[hsl(38_74%_63%/0.08)] hover:bg-[hsl(38_74%_63%/0.18)] text-foreground'
              }`}
            >
              <span>🌙</span>
              <span>{language === 'ar' ? m.titleAr : m.titleEn}</span>
            </button>
          ))}

          <input
            type="date"
            value={customDate}
            onChange={(e) => {
              const val = e.target.value;
              setCustomDate(val);
              if (val) setDateFilter(val);
            }}
            className="rounded-xl border border-input bg-background px-3 py-1 text-xs font-semibold outline-none focus:ring-2 focus:ring-primary"
          />

          {dateFilter !== 'all' && (
            <span className="rounded-full bg-[hsl(38_74%_63%/0.15)] px-3 py-1 text-xs font-bold text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)] flex items-center gap-1">
              <span>🌙</span>
              <span>
                {formatDualDate(
                  dateFilter === 'today' ? todayStr : dateFilter === 'tomorrow' ? tomorrowStr : dateFilter,
                  language,
                  sightingOffset
                )}
              </span>
            </span>
          )}
        </div>

        {/* Search & Deficits Filter Toggle */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              data-testid="input-search-demand"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={language === 'ar' ? 'بحث عن صنف...' : 'Search sweets...'}
              className="w-full rounded-xl bg-muted py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <button
            type="button"
            data-testid="button-toggle-deficits-only"
            onClick={() => setFilterDeficitsOnly((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
              filterDeficitsOnly
                ? 'bg-destructive text-white shadow-xs'
                : 'border border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            <AlertCircle size={14} />
            <span>{filterDeficitsOnly ? t('filterDeficitsOnly') : (language === 'ar' ? 'عرض الأصناف التي بها عجز فقط' : 'Show Deficits Only')}</span>
          </button>
        </div>
      </div>

      {/* Sweets Balance Cards Grid */}
      <div className="mt-8 space-y-4">
        {displayedCategories.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
            <Package size={36} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-display text-2xl font-bold">
              {filterDeficitsOnly
                ? (language === 'ar' ? 'لا يوجد أي عجز في الأصناف المعروضة 🎉' : 'No sweets currently in deficit 🎉')
                : (language === 'ar' ? 'لم يتم العثور على أصناف مطابقة للبحث' : 'No matching sweets found')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filterDeficitsOnly
                ? (language === 'ar' ? 'المخزون الحالي كافٍ لتغطية كافة الطلبيات النشطة المحددة.' : 'Current inventory is sufficient for all active orders.')
                : (language === 'ar' ? 'جرب تغيير معايير البحث أو تصفية التاريخ.' : 'Try adjusting your search or date filter.')}
            </p>
          </div>
        ) : (
          displayedCategories.map((item) => (
            <div
              key={item.category.id}
              data-testid={`card-stock-demand-${item.category.id}`}
              className={`rounded-3xl border bg-card p-5 transition-all shadow-xs ${
                item.hasDeficit ? 'border-destructive/40 bg-destructive/[0.02]' : 'border-border'
              }`}
            >
              {/* Sweet Title & Thumbnail Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div className="flex items-center gap-3">
                  {item.category.imageUrl ? (
                    <img
                      src={item.category.imageUrl}
                      alt={item.category.name}
                      className="size-14 rounded-2xl object-cover border border-border shadow-2xs"
                    />
                  ) : (
                    <div className="grid size-14 place-items-center rounded-2xl bg-secondary text-xl">
                      🍰
                    </div>
                  )}
                  <div>
                    <h2 className="font-display text-xl font-bold">{item.category.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.isKilo
                        ? (language === 'ar' ? 'يباع بالكيلو ونصف الكيلو (مخزون مستقل)' : 'Sold in 1 kg and 0.5 kg (Separated Stocks)')
                        : `${getUnitLabel(item.category.unit, language)}`}
                    </p>
                  </div>
                </div>

                <div>
                  {item.hasDeficit ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/15 px-3 py-1 text-xs font-bold text-destructive">
                      <AlertCircle size={14} />
                      <span>{language === 'ar' ? 'عجز في المخزون مطلوب خبيزه' : 'Deficit — Baking Needed'}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(153_28%_48%/0.4)] bg-[hsl(153_28%_48%/0.12)] px-3 py-1 text-xs font-bold text-[hsl(153_38%_30%)] dark:text-[hsl(153_48%_65%)]">
                      <Check size={14} />
                      <span>{language === 'ar' ? 'المخزون متوفر ومغطى بالكامل' : 'Covered & Available'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Sub-panels: Kilo & Half-Kilo */}
              {item.isKilo ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {/* 1 kg Section */}
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                          <Scale size={14} />
                          <span>{language === 'ar' ? '1 كجم (كيلو كامل)' : '1 kg Specifications'}</span>
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {money.format(item.category.pricePerUnit)} / {t('kiloUnit')}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-background/80 p-2.5 border border-border/60">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                            {t('currentStock')}
                          </span>
                          <span className="mt-1 font-display text-xl font-bold block">
                            {item.kiloStock}
                          </span>
                        </div>
                        <div className="rounded-xl bg-background/80 p-2.5 border border-border/60">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                            {t('activeDemand')}
                          </span>
                          <span className="mt-1 font-display text-xl font-bold text-primary block">
                            {item.kiloDemand}
                          </span>
                        </div>
                        <div
                          className={`rounded-xl p-2.5 border ${
                            item.kiloBalance < 0
                              ? 'bg-destructive/15 border-destructive/40 text-destructive'
                              : 'bg-[hsl(153_28%_48%/0.15)] border-[hsl(153_28%_48%/0.4)] text-[hsl(153_38%_30%)] dark:text-[hsl(153_48%_65%)]'
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase block opacity-85">
                            {item.kiloBalance < 0 ? t('deficitShortage') : t('surplusAvailable')}
                          </span>
                          <span className="mt-1 font-display text-xl font-bold block">
                            {item.kiloBalance < 0 ? `-${item.kiloDeficit}` : `+${item.kiloBalance}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                      <button
                        type="button"
                        data-testid={`button-drilldown-kilo-${item.category.id}`}
                        onClick={() =>
                          setDrillDownTarget({
                            categoryName: item.category.name,
                            unit: 'kilo',
                            orders: item.kiloOrders,
                          })
                        }
                        disabled={item.kiloOrders.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40 shadow-2xs transition-colors"
                      >
                        <ClipboardList size={13} className="text-muted-foreground" />
                        <span>
                          {language === 'ar'
                            ? `عرض ${item.kiloOrders.length} طلب`
                            : `View ${item.kiloOrders.length} orders`}
                        </span>
                      </button>

                      <button
                        type="button"
                        data-testid={`button-quick-restock-kilo-${item.category.id}`}
                        onClick={() => handleOpenRestock(item.category, 'kilo')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 shadow-2xs transition-opacity"
                      >
                        <Plus size={13} />
                        <span>{t('quickRestock')}</span>
                      </button>
                    </div>
                  </div>

                  {/* 0.5 kg Section */}
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.03] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <Package size={14} />
                          <span>{language === 'ar' ? '0.5 كجم (نصف كيلو)' : '0.5 kg Specifications'}</span>
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {money.format(item.category.halfKiloPrice || Math.round(item.category.pricePerUnit / 2))} / {t('halfKiloUnit')}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-background/80 p-2.5 border border-border/60">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                            {t('currentStock')}
                          </span>
                          <span className="mt-1 font-display text-xl font-bold block">
                            {item.halfKiloStock}
                          </span>
                        </div>
                        <div className="rounded-xl bg-background/80 p-2.5 border border-border/60">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                            {t('activeDemand')}
                          </span>
                          <span className="mt-1 font-display text-xl font-bold text-amber-600 dark:text-amber-400 block">
                            {item.halfKiloDemand}
                          </span>
                        </div>
                        <div
                          className={`rounded-xl p-2.5 border ${
                            item.halfKiloBalance < 0
                              ? 'bg-destructive/15 border-destructive/40 text-destructive'
                              : 'bg-[hsl(153_28%_48%/0.15)] border-[hsl(153_28%_48%/0.4)] text-[hsl(153_38%_30%)] dark:text-[hsl(153_48%_65%)]'
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase block opacity-85">
                            {item.halfKiloBalance < 0 ? t('deficitShortage') : t('surplusAvailable')}
                          </span>
                          <span className="mt-1 font-display text-xl font-bold block">
                            {item.halfKiloBalance < 0 ? `-${item.halfKiloDeficit}` : `+${item.halfKiloBalance}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                      <button
                        type="button"
                        data-testid={`button-drilldown-half-kilo-${item.category.id}`}
                        onClick={() =>
                          setDrillDownTarget({
                            categoryName: item.category.name,
                            unit: 'half_kilo',
                            orders: item.halfKiloOrders,
                          })
                        }
                        disabled={item.halfKiloOrders.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40 shadow-2xs transition-colors"
                      >
                        <ClipboardList size={13} className="text-muted-foreground" />
                        <span>
                          {language === 'ar'
                            ? `عرض ${item.halfKiloOrders.length} طلب`
                            : `View ${item.halfKiloOrders.length} orders`}
                        </span>
                      </button>

                      <button
                        type="button"
                        data-testid={`button-quick-restock-half-kilo-${item.category.id}`}
                        onClick={() => handleOpenRestock(item.category, 'half_kilo')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 dark:bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 shadow-2xs transition-opacity"
                      >
                        <Plus size={13} />
                        <span>{t('quickRestock')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Box / Piece non-kilo section */
                <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-background p-3 border border-border/60">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                        {t('currentStock')}
                      </span>
                      <span className="mt-1 font-display text-2xl font-bold block">
                        {item.stock} {getUnitLabel(item.category.unit, language)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-background p-3 border border-border/60">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                        {t('activeDemand')}
                      </span>
                      <span className="mt-1 font-display text-2xl font-bold text-primary block">
                        {item.demand} {getUnitLabel(item.category.unit, language)}
                      </span>
                    </div>
                    <div
                      className={`rounded-xl p-3 border ${
                        item.balance < 0
                          ? 'bg-destructive/15 border-destructive/40 text-destructive'
                          : 'bg-[hsl(153_28%_48%/0.15)] border-[hsl(153_28%_48%/0.4)] text-[hsl(153_38%_30%)] dark:text-[hsl(153_48%_65%)]'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase block opacity-85">
                        {item.balance < 0 ? t('deficitShortage') : t('surplusAvailable')}
                      </span>
                      <span className="mt-1 font-display text-2xl font-bold block">
                        {item.balance < 0 ? `-${item.deficit}` : `+${item.balance}`} {getUnitLabel(item.category.unit, language)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                    <button
                      type="button"
                      data-testid={`button-drilldown-regular-${item.category.id}`}
                      onClick={() =>
                        setDrillDownTarget({
                          categoryName: item.category.name,
                          unit: item.category.unit,
                          orders: item.orders,
                        })
                      }
                      disabled={item.orders.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40 shadow-2xs transition-colors"
                    >
                      <ClipboardList size={13} className="text-muted-foreground" />
                      <span>
                        {language === 'ar'
                          ? `عرض ${item.orders.length} طلب`
                          : `View ${item.orders.length} orders`}
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid={`button-quick-restock-regular-${item.category.id}`}
                      onClick={() => handleOpenRestock(item.category, item.category.unit as any)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 shadow-2xs transition-opacity"
                    >
                      <Plus size={13} />
                      <span>{t('quickRestock')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Quick Restock Modal Dialog */}
      {restockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Plus size={18} />
                </span>
                <h3 className="font-display text-lg font-bold">{t('quickRestock')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setRestockTarget(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="font-bold text-base">{restockTarget.category.name}</p>
                <p className="text-xs text-muted-foreground">
                  {language === 'ar' ? 'الوحدة المراد زيادتها:' : 'Unit to restock:'}{' '}
                  <span className="font-bold text-primary">
                    {restockTarget.unit === 'half_kilo'
                      ? t('halfKiloUnit')
                      : restockTarget.unit === 'kilo'
                        ? t('kiloUnit')
                        : getUnitLabel(restockTarget.unit, language)}
                  </span>
                </p>
              </div>

              <div className="rounded-2xl bg-muted/40 p-3.5 border border-border/60 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('currentStock')}:</span>
                  <span className="font-mono font-bold">
                    {restockTarget.unit === 'half_kilo'
                      ? Number(restockTarget.category.halfKiloStock) || 0
                      : Number(restockTarget.category.stockQuantity) || 0}
                  </span>
                </div>
                {parseFloat(restockAmount) > 0 && (
                  <div className="flex justify-between border-t border-border/40 pt-1.5 text-primary font-bold">
                    <span>{language === 'ar' ? 'المخزون الجديد بعد الإضافة:' : 'New Stock Preview:'}</span>
                    <span className="font-mono">
                      {(restockTarget.unit === 'half_kilo'
                        ? Number(restockTarget.category.halfKiloStock) || 0
                        : Number(restockTarget.category.stockQuantity) || 0) + parseFloat(restockAmount)}
                    </span>
                  </div>
                )}
              </div>

              <label className="block">
                <span className="text-xs font-bold text-foreground">
                  {language === 'ar' ? 'كمية الإنتاج المخبوزة للإضافة:' : 'Production Batch to Add:'}
                </span>
                <input
                  type="number"
                  autoFocus
                  min="0.5"
                  step="0.5"
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: 10' : 'e.g. 10'}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-base font-bold outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRestockTarget(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!parseFloat(restockAmount) || updateCategory.isPending}
                onClick={handleConfirmRestock}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40 shadow-sm"
              >
                {updateCategory.isPending && <Loader2 size={14} className="animate-spin" />}
                <span>{t('confirmRestock')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down Drawer (Slide-over) */}
      {drillDownTarget && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs"
          onClick={() => setDrillDownTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-lg bg-card p-6 shadow-2xl overflow-y-auto animate-in slide-in-from-right-5 border-l border-border"
          >
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  {t('ordersRequiringSweet')}
                </p>
                <h3 className="mt-1 font-display text-2xl font-bold">
                  {drillDownTarget.categoryName}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {language === 'ar' ? 'الوحدة المطلوبة:' : 'Unit:'}{' '}
                  <span className="font-bold text-foreground">
                    {drillDownTarget.unit === 'half_kilo'
                      ? t('halfKiloUnit')
                      : drillDownTarget.unit === 'kilo'
                        ? t('kiloUnit')
                        : getUnitLabel(drillDownTarget.unit, language)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrillDownTarget(null)}
                className="rounded-xl p-2 text-muted-foreground hover:bg-muted"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-muted/40 p-3 border border-border/60 text-xs font-semibold text-muted-foreground">
              {language === 'ar'
                ? `إجمالي الكمية المطلوبة في هذه الطلبات: ${drillDownTarget.orders.reduce((acc, curr) => acc + curr.quantity, 0)} ${getUnitLabel(drillDownTarget.unit, language)} عبر ${drillDownTarget.orders.length} طلب`
                : `Total Demanded: ${drillDownTarget.orders.reduce((acc, curr) => acc + curr.quantity, 0)} ${getUnitLabel(drillDownTarget.unit, language)} across ${drillDownTarget.orders.length} orders`}
            </div>

            <div className="mt-5 space-y-3">
              {drillDownTarget.orders.map(({ order, quantity }) => (
                <div
                  key={order.id}
                  className="rounded-2xl border border-border bg-background p-4 shadow-2xs hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary">
                          {order.orderNumber}
                        </span>
                        <StatusPill status={order.status} />
                      </div>
                      <p className="mt-1 text-sm font-bold">{order.customerName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                        <span>📞 {order.phoneNumber}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="rounded-xl bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary block">
                        {quantity}{' '}
                        {drillDownTarget.unit === 'half_kilo'
                          ? t('halfKiloUnit')
                          : drillDownTarget.unit === 'kilo'
                            ? t('kiloUnit')
                            : getUnitLabel(drillDownTarget.unit, language)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
                    <span>
                      ⏰ {order.pickupDate} · {order.pickupTime}
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={getWhatsAppLink(order, language)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-[hsl(153_28%_48%/0.5)] bg-[hsl(153_28%_48%/0.1)] px-2 py-1 text-[11px] font-bold text-[hsl(153_38%_30%)] hover:bg-[hsl(153_28%_48%/0.2)] shadow-2xs transition-colors"
                      >
                        <MessageSquare size={12} />
                        <span>واتساب</span>
                      </a>
                      <Link
                        href={`/admin/orders?search=${encodeURIComponent(order.orderNumber)}`}
                        onClick={() => setDrillDownTarget(null)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted shadow-2xs transition-colors"
                      >
                        <span>{language === 'ar' ? 'فتح الطلب' : 'Open'}</span>
                        <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriesPage() {
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const categoriesQuery = useListCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [photoEditing, setPhotoEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({
    name: '',
    unit: 'kilo',
    price: '',
    stock: '',
    threshold: '5',
    halfKiloPrice: '',
    halfKiloStock: '',
    halfKiloThreshold: '5',
    imageUrl: '',
  });

  const openForm = (category: Category | 'new') => {
    setEditing(category);
    if (category === 'new') {
      setForm({
        name: '',
        unit: 'kilo',
        price: '',
        stock: '',
        threshold: '5',
        halfKiloPrice: '',
        halfKiloStock: '',
        halfKiloThreshold: '5',
        imageUrl: '',
      });
    } else {
      setForm({
        name: category.name,
        unit: category.unit,
        price: String(category.pricePerUnit),
        stock: String(category.stockQuantity),
        threshold: String(category.lowStockThreshold ?? '5'),
        halfKiloPrice: category.halfKiloPrice !== null && category.halfKiloPrice !== undefined ? String(category.halfKiloPrice) : '',
        halfKiloStock: category.halfKiloStock !== undefined ? String(category.halfKiloStock) : '0',
        halfKiloThreshold: category.halfKiloThreshold !== undefined ? String(category.halfKiloThreshold) : '5',
        imageUrl: category.imageUrl || '',
      });
    }
  };

  const save = () => {
    const isKilo = form.unit === 'kilo';
    const data = {
      name: form.name.trim(),
      unit: form.unit as 'kilo' | 'half_kilo' | 'box' | 'piece',
      pricePerUnit: Number(form.price),
      stockQuantity: Number(form.stock),
      lowStockThreshold: Number(form.threshold) || 5,
      halfKiloPrice: isKilo && form.halfKiloPrice ? Number(form.halfKiloPrice) : null,
      halfKiloStock: isKilo ? Number(form.halfKiloStock || 0) : 0,
      halfKiloThreshold: isKilo ? Number(form.halfKiloThreshold || 5) : 5,
      imageUrl: form.imageUrl.trim() || undefined,
    };
    if (editing === 'new') {
      createCategory.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setEditing(null);
        },
      });
    } else if (editing) {
      updateCategory.mutate({ categoryId: editing.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setEditing(null);
        },
      });
    }
  };

  const savePhoto = (imageUrl: string) => { if (!photoEditing) return; updateCategory.mutate({ categoryId: photoEditing.id, data: { imageUrl } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); setPhotoEditing(null); } }); };
  const remove = (category: Category) => { if (window.confirm(language === 'ar' ? `حذف ${category.name} من الرف؟` : `Remove ${category.name} from the shelf?`)) deleteCategory.mutate({ categoryId: category.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }) }); };
  const categories = Array.isArray(categoriesQuery.data) ? categoriesQuery.data : [];
  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">{t('stockRoom')}</p>
          <h1 className="mt-2 font-display text-4xl">{t('categories')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('stockDescription')}</p>
        </div>
        <button
          data-testid="button-add-category"
          onClick={() => openForm('new')}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          <Plus size={16} /> {t('addCategory')}
        </button>
      </div>

      {categoriesQuery.isLoading ? (
        <PageLoader label={t('checkingShelf')} />
      ) : categoriesQuery.isError ? (
        <QueryError retry={() => categoriesQuery.refetch()} />
      ) : categories.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
          <Package className="mx-auto text-muted-foreground" size={26} />
          <p className="mt-3 font-display text-2xl">{t('shelfEmpty')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('addFirstSweet')}</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {categories.map((category) => {
            const isKilo = category.unit === 'kilo';
            const lowKilo = category.stockQuantity <= (category.lowStockThreshold || 0);
            const halfStock = category.halfKiloStock ?? 0;
            const halfThreshold = category.halfKiloThreshold ?? 5;
            const lowHalf = halfStock <= halfThreshold;
            const low = isKilo ? (lowKilo || lowHalf) : lowKilo;

            return (
              <div key={category.id} data-testid={`card-inventory-${category.id}`} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5">
                    <div
                      className="group/pic relative size-14 rounded-xl overflow-hidden border border-border shadow-sm shrink-0 cursor-pointer"
                      onClick={() => setPhotoEditing(category)}
                      title={t('changePhoto')}
                    >
                      <img
                        src={category.imageUrl || getCategoryFallbackImage(category.name)}
                        alt={category.name}
                        className="size-full object-cover transition-transform duration-300 group-hover/pic:scale-110"
                        onError={(e) => {
                          e.currentTarget.src = getCategoryFallbackImage(category.name);
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/pic:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Camera size={18} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold">{category.name}</h2>
                        {category.isActive === false && (
                          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{t('hidden')}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isKilo
                          ? `${money.format(category.pricePerUnit)} / ${t('kiloUnit')} · ${money.format(category.halfKiloPrice || Math.round(category.pricePerUnit / 2))} / ${t('halfKiloUnit')}`
                          : `${money.format(category.pricePerUnit)} / ${getUnitLabel(category.unit, language)}`}
                      </p>
                    </div>
                  </div>
                  <div className={`rounded-xl p-2 ${low ? 'bg-[hsl(3_58%_48%/0.12)] text-[hsl(3_58%_42%)]' : 'bg-[hsl(153_28%_48%/0.12)] text-[hsl(153_38%_30%)]'}`}>
                    <Package size={18} />
                  </div>
                </div>

                {isKilo ? (
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
                    <div className="rounded-xl bg-muted/40 p-3 border border-border/50">
                      <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                        <span>{language === 'ar' ? 'مخزون الكيلو' : '1 kg Stock'}</span>
                        <span className="font-mono text-foreground font-bold">{money.format(category.pricePerUnit)}</span>
                      </div>
                      <p className="mt-2 font-display text-2xl font-bold">
                        {category.stockQuantity} <span className="text-xs font-normal text-muted-foreground">{language === 'ar' ? 'كيلو (بالمحل)' : 'kg (physical)'}</span>
                      </p>
                      {category.reservedStock ? (
                        <p className="mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          {language === 'ar' ? `محجوز: ${category.reservedStock} · متاح: ${category.availableStock ?? category.stockQuantity}` : `Reserved: ${category.reservedStock} · Avail: ${category.availableStock ?? category.stockQuantity}`}
                        </p>
                      ) : null}
                      <p className={`mt-1 text-[11px] font-bold ${lowKilo ? 'text-[hsl(3_58%_42%)]' : 'text-muted-foreground'}`}>
                        {lowKilo ? t('lowStock') : `${t('target')}: ${category.lowStockThreshold || 0}`}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3 border border-border/50">
                      <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                        <span>{language === 'ar' ? 'مخزون نصف الكيلو' : '0.5 kg Stock'}</span>
                        <span className="font-mono text-foreground font-bold">
                          {money.format(category.halfKiloPrice || Math.round(category.pricePerUnit / 2))}
                        </span>
                      </div>
                      <p className="mt-2 font-display text-2xl font-bold">
                        {halfStock} <span className="text-xs font-normal text-muted-foreground">{language === 'ar' ? 'نصف كيلو (بالمحل)' : '0.5 kg (physical)'}</span>
                      </p>
                      {category.reservedHalfKiloStock ? (
                        <p className="mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          {language === 'ar' ? `محجوز: ${category.reservedHalfKiloStock} · متاح: ${category.availableHalfKiloStock ?? halfStock}` : `Reserved: ${category.reservedHalfKiloStock} · Avail: ${category.availableHalfKiloStock ?? halfStock}`}
                        </p>
                      ) : null}
                      <p className={`mt-1 text-[11px] font-bold ${lowHalf ? 'text-[hsl(3_58%_42%)]' : 'text-muted-foreground'}`}>
                        {lowHalf ? t('lowStock') : `${t('target')}: ${halfThreshold}`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-7 flex items-end justify-between">
                    <div>
                      <p className="font-display text-4xl">{category.stockQuantity}</p>
                      {category.reservedStock ? (
                        <p className="mt-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          {language === 'ar' ? `محجوز: ${category.reservedStock} · متاح: ${category.availableStock ?? category.stockQuantity}` : `Reserved: ${category.reservedStock} · Avail: ${category.availableStock ?? category.stockQuantity}`}
                        </p>
                      ) : null}
                      <p className={`mt-1 text-xs font-bold ${low ? 'text-[hsl(3_58%_42%)]' : 'text-muted-foreground'}`}>
                        {low ? t('lowStock') : `${t('target')}: ${category.lowStockThreshold || 0}`}
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
                  <button
                    data-testid={`button-change-photo-${category.id}`}
                    onClick={() => setPhotoEditing(category)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Camera size={13} /> {t('changePhoto')}
                  </button>
                  <button
                    data-testid={`button-edit-category-${category.id}`}
                    onClick={() => openForm(category)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"
                  >
                    <Pencil size={13} /> {t('edit')}
                  </button>
                  <button
                    data-testid={`button-delete-category-${category.id}`}
                    onClick={() => remove(category)}
                    className="grid size-9 place-items-center rounded-lg border border-border text-[hsl(3_58%_42%)]"
                    aria-label="حذف الصنف"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <CategoryModal
          editing={editing}
          form={form}
          setForm={setForm}
          onClose={() => setEditing(null)}
          onSave={save}
          isPending={createCategory.isPending || updateCategory.isPending}
        />
      )}
      {photoEditing && (
        <ChangeCategoryPictureModal
          category={photoEditing}
          onClose={() => setPhotoEditing(null)}
          onSave={savePhoto}
          isPending={updateCategory.isPending}
        />
      )}
    </div>
  );
}

function ChangeCategoryPictureModal({ category, onClose, onSave, isPending }: { category: Category; onClose: () => void; onSave: (imageUrl: string) => void; isPending: boolean }) {
  const { t, language } = useLanguage();
  const [selectedUrl, setSelectedUrl] = useState(category.imageUrl || getCategoryFallbackImage(category.name));
  const [customInput, setCustomInput] = useState(category.imageUrl || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const dataUrl = await compressImageFile(file);
      setSelectedUrl(dataUrl);
      setCustomInput(dataUrl);
    } catch (err) {
      console.error('Failed to process image', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(164_31%_18%/0.4)] p-0 backdrop-blur-sm sm:items-center sm:p-5"><div className="w-full max-w-lg rounded-t-3xl bg-card p-6 shadow-xl sm:rounded-3xl max-h-[92vh] overflow-y-auto"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(9_54%_63%)]">{t('changeCategoryPictureTitle')}</p><h2 className="mt-1 font-display text-2xl">{category.name}</h2></div><button data-testid="button-close-photo-modal" onClick={onClose} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-foreground" aria-label="إغلاق"><X size={17} /></button></div><div className="mt-5 relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-border bg-muted shadow-inner"><img src={selectedUrl} alt={category.name} className="size-full object-cover" onError={(e) => { e.currentTarget.src = getCategoryFallbackImage(category.name); }} /><div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" /><span className="absolute bottom-3 start-3 rounded-lg bg-black/40 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">{language === 'ar' ? 'معاينة الصورة الحالية' : 'Current preview'}</span></div><div className="mt-4"><input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} /><button type="button" data-testid="button-upload-device-photo" disabled={isProcessing} onClick={() => fileInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">{isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}<span>{isProcessing ? t('uploadingPhoto') : t('uploadFromDevice')}</span></button></div><div className="mt-5"><p className="text-xs font-bold text-muted-foreground mb-2.5">{t('selectPresetImage')}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{SWEET_IMAGE_PRESETS.map((preset) => { const isSelected = selectedUrl === preset.url; return <button key={preset.url} type="button" onClick={() => { setSelectedUrl(preset.url); setCustomInput(preset.url); }} className={`flex items-center gap-2 rounded-xl border p-2 text-start transition-all ${isSelected ? 'border-primary bg-primary/10 ring-2 ring-primary/30 font-bold text-primary' : 'border-border bg-card hover:bg-muted text-foreground'}`}><img src={preset.url} alt="" className="size-8 rounded-lg object-cover shrink-0" /><span className="text-xs truncate">{language === 'ar' ? preset.label : preset.labelEn}</span></button>; })}</div></div><div className="mt-5"><label className="block text-xs font-bold text-muted-foreground mb-1.5">{t('customUrl')}</label><input data-testid="input-photo-custom-url" value={customInput} onChange={(e) => { setCustomInput(e.target.value); if (e.target.value.trim()) setSelectedUrl(e.target.value.trim()); }} placeholder={t('imageUrlPlaceholder')} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-xs outline-none focus:border-primary" /></div><div className="mt-6 flex justify-end gap-2 border-t border-border pt-4"><button data-testid="button-cancel-photo-modal" type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted">{t('cancel')}</button><button data-testid="button-save-photo-modal" type="button" disabled={!selectedUrl || isPending || isProcessing} onClick={() => onSave(selectedUrl)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">{isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}<span>{t('savePhoto')}</span></button></div></div></div>;
}

function CategoryModal({
  editing,
  form,
  setForm,
  onClose,
  onSave,
  isPending,
}: {
  editing: Category | 'new';
  form: {
    name: string;
    unit: string;
    price: string;
    stock: string;
    threshold: string;
    halfKiloPrice: string;
    halfKiloStock: string;
    halfKiloThreshold: string;
    imageUrl: string;
  };
  setForm: (form: {
    name: string;
    unit: string;
    price: string;
    stock: string;
    threshold: string;
    halfKiloPrice: string;
    halfKiloStock: string;
    halfKiloThreshold: string;
    imageUrl: string;
  }) => void;
  onClose: () => void;
  onSave: () => void;
  isPending: boolean;
}) {
  const { t, language } = useLanguage();
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const update = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  const previewImage = form.imageUrl || getCategoryFallbackImage(form.name);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const dataUrl = await compressImageFile(file);
      update('imageUrl', dataUrl);
    } catch (err) {
      console.error('Failed to process image', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const isKilo = form.unit === 'kilo';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(164_31%_18%/0.35)] p-0 sm:items-center sm:p-5">
      <div className="w-full max-w-lg rounded-t-3xl bg-card p-6 sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t('shelfEditor')}</p>
            <h2 className="mt-1 font-display text-3xl">{editing === 'new' ? t('addCategoryTitle') : t('editCategory')}</h2>
          </div>
          <button data-testid="button-close-category-modal" onClick={onClose} className="rounded-xl border border-border p-2" aria-label="إغلاق">
            <X size={17} />
          </button>
        </div>

        {/* Image Preview & Upload */}
        <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-3.5">
            <img
              src={previewImage}
              alt="صورة الصنف"
              className="size-16 rounded-xl object-cover border border-border shadow-sm shrink-0"
              onError={(e) => {
                e.currentTarget.src = getCategoryFallbackImage(form.name);
              }}
            />
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('categoryImage')}</label>
              <div className="flex gap-2">
                <input
                  data-testid="input-category-image"
                  value={form.imageUrl}
                  onChange={(e) => update('imageUrl', e.target.value)}
                  placeholder={t('imageUrlPlaceholder')}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary"
                />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                <button
                  type="button"
                  data-testid="button-modal-upload-photo"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted shrink-0 text-foreground transition-colors disabled:opacity-50"
                  title={t('uploadFromDevice')}
                >
                  {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  <span className="hidden sm:inline">{t('uploadFromDevice')}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">{t('selectPresetImage')}</p>
            <div className="flex flex-wrap gap-1.5">
              {SWEET_IMAGE_PRESETS.map((preset) => {
                const isSelected = form.imageUrl === preset.url;
                return (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => update('imageUrl', preset.url)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${isSelected ? 'border-primary bg-primary/10 font-bold text-primary' : 'border-border bg-card text-foreground hover:bg-muted'}`}
                  >
                    <img src={preset.url} alt="" className="size-4 rounded-full object-cover" />
                    <span>{language === 'ar' ? preset.label : preset.labelEn}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-bold">
            {t('categoryName')}
            <input
              data-testid="input-category-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary"
            />
          </label>

          <label className="block text-sm font-bold">
            {t('unit')}
            <select
              data-testid="select-category-unit"
              value={form.unit}
              onChange={(e) => update('unit', e.target.value)}
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none"
            >
              <option value="kilo">{language === 'ar' ? 'كيلو ونصف كيلو (مخزون منفصل لكل منهما)' : 'Kilo & Half-Kilo (Separated Stocks)'}</option>
              <option value="box">{t('box')}</option>
              <option value="piece">{t('piece')}</option>
            </select>
          </label>

          {isKilo ? (
            <div className="space-y-4">
              {/* Kilo section */}
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  {language === 'ar' ? 'بيانات الكيلو' : '1 kg Specifications'}
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  <label className="block text-xs font-bold">
                    {language === 'ar' ? 'سعر الكيلو' : '1 kg Price'}
                    <input
                      data-testid="input-category-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => update('price', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary"
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {language === 'ar' ? 'مخزون الكيلو' : '1 kg Stock'}
                    <input
                      data-testid="input-category-stock"
                      type="number"
                      min="0"
                      step="1"
                      value={form.stock}
                      onChange={(e) => update('stock', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary"
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {language === 'ar' ? 'حد التنبيه' : '1 kg Alert'}
                    <input
                      data-testid="input-category-threshold"
                      type="number"
                      min="0"
                      value={form.threshold}
                      onChange={(e) => update('threshold', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary"
                    />
                  </label>
                </div>
              </div>

              {/* Half-kilo section */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    {language === 'ar' ? 'بيانات نصف الكيلو (مخزون وتسعير مستقل)' : '0.5 kg Specifications (Separated Stock)'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <label className="block text-xs font-bold">
                    {language === 'ar' ? 'سعر نصف الكيلو' : '0.5 kg Price'}
                    <input
                      data-testid="input-category-half-price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={form.price ? String(Math.round(Number(form.price) / 2)) : ''}
                      value={form.halfKiloPrice}
                      onChange={(e) => update('halfKiloPrice', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary"
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {language === 'ar' ? 'مخزون نصف الكيلو' : '0.5 kg Stock'}
                    <input
                      data-testid="input-category-half-stock"
                      type="number"
                      min="0"
                      step="1"
                      value={form.halfKiloStock}
                      onChange={(e) => update('halfKiloStock', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary"
                    />
                  </label>
                  <label className="block text-xs font-bold">
                    {language === 'ar' ? 'حد التنبيه' : '0.5 kg Alert'}
                    <input
                      data-testid="input-category-half-threshold"
                      type="number"
                      min="0"
                      value={form.halfKiloThreshold}
                      onChange={(e) => update('halfKiloThreshold', e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary"
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm font-bold">
                {t('pricePerUnit')}
                <input
                  data-testid="input-category-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => update('price', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none"
                />
              </label>
              <label className="block text-sm font-bold">
                {t('stockQuantity')}
                <input
                  data-testid="input-category-stock"
                  type="number"
                  min="0"
                  step="0.25"
                  value={form.stock}
                  onChange={(e) => update('stock', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none"
                />
              </label>
              <label className="block text-sm font-bold">
                {t('lowStockAlert')}
                <input
                  data-testid="input-category-threshold"
                  type="number"
                  min="0"
                  value={form.threshold}
                  onChange={(e) => update('threshold', e.target.value)}
                  className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none"
                />
              </label>
            </div>
          )}
        </div>

        <div className="mt-7 flex justify-end gap-2">
          <button data-testid="button-cancel-category" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted-foreground">
            {t('cancel')}
          </button>
          <button
            data-testid="button-save-category"
            disabled={!form.name || !form.price || !form.stock || isPending}
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
          >
            {isPending && <Loader2 size={15} className="animate-spin" />} {t('saveCategory')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const { language, t } = useLanguage();
  const [timeframe, setTimeframe] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [statusMode, setStatusMode] = useState<'delivered' | 'confirmed'>('delivered');
  const [searchSweet, setSearchSweet] = useState<string>('');

  const params: GetDashboardAnalyticsParams = useMemo(() => ({
    ...(timeframe !== 'all' && timeframe !== 'custom' ? { timeframe } : {}),
    ...(customDate && timeframe === 'custom' ? { date: customDate } : {}),
    ...(statusMode ? { statusMode } : {}),
  }), [timeframe, customDate, statusMode]);

  const summaryQuery = useGetDashboardSummary();
  const analyticsQuery = useGetDashboardAnalytics(params, {
    query: {
      queryKey: getGetDashboardAnalyticsQueryKey(params),
      refetchInterval: 15_000,
    },
  });

  const analytics = analyticsQuery.data as DashboardAnalytics | undefined;
  const maxDaily = Math.max(...(analytics?.dailyOrders || []).map((item) => item.orders), 1);

  // Filter categoryTotals by search
  const displayedCategories = useMemo(() => {
    const list = analytics?.categoryTotals || [];
    if (!searchSweet.trim()) return list;
    const q = searchSweet.trim().toLowerCase();
    return list.filter((cat) => cat.categoryName.toLowerCase().includes(q));
  }, [analytics?.categoryTotals, searchSweet]);

  // Export CSV
  const handleExportCsv = () => {
    const list = analytics?.categoryTotals || [];
    if (list.length === 0) return;

    const headers = [
      language === 'ar' ? 'الصنف' : 'Sweet Name',
      language === 'ar' ? 'الوحدة' : 'Unit',
      language === 'ar' ? 'عبوات 1 كجم' : '1 kg Units',
      language === 'ar' ? 'عبوات 0.5 كجم' : '0.5 kg Units',
      language === 'ar' ? 'إجمالي الوزن (كجم)' : 'Total Weight (kg)',
      language === 'ar' ? 'العلب' : 'Boxes',
      language === 'ar' ? 'القطع' : 'Pieces',
      language === 'ar' ? 'عدد الفواتير' : 'Invoices Count',
      language === 'ar' ? 'الإيراد (ج.م)' : 'Revenue (EGP)',
      language === 'ar' ? 'الحصة (%)' : 'Revenue Share (%)',
    ];

    const rows = list.map((item) => [
      `"${item.categoryName.replace(/"/g, '""')}"`,
      item.unit || '',
      item.kilosSold ?? 0,
      item.halfKilosSold ?? 0,
      item.totalWeightKg ?? 0,
      item.boxesSold ?? 0,
      item.piecesSold ?? 0,
      item.ordersCount ?? 0,
      item.revenue ?? 0,
      `${item.revenueShare ?? 0}%`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sales-analytics-${timeframe}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getUnitBadge = (unit?: string) => {
    if (unit === 'half_kilo') return language === 'ar' ? '½ كجم' : '0.5 kg';
    if (unit === 'kilo') return language === 'ar' ? 'كجم' : '1 kg';
    if (unit === 'box') return language === 'ar' ? 'علبة' : 'Box';
    if (unit === 'piece') return language === 'ar' ? 'قطعة' : 'Pc';
    return unit || '';
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">
          {t('signals')}
        </p>
        <h1 className="mt-2 font-display text-4xl">{t('eidAtGlance')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('analyticsDescription')}</p>
      </div>

      {/* Timeframe & Status Mode Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mr-1">
            <CalendarDays size={15} className="text-primary" />
            <span>{language === 'ar' ? 'الفترة الزمنية:' : 'Time Period:'}</span>
          </div>

          <button
            type="button"
            data-testid="button-timeframe-all"
            onClick={() => { setTimeframe('all'); setCustomDate(''); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              timeframe === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {language === 'ar' ? 'طوال الموسم' : 'All Season'}
          </button>

          <button
            type="button"
            data-testid="button-timeframe-today"
            onClick={() => { setTimeframe('today'); setCustomDate(''); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
              timeframe === 'today'
                ? 'bg-[hsl(9_54%_55%)] text-white shadow-xs'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            <Clock3 size={13} />
            <span>{language === 'ar' ? 'اليوم (Today)' : 'Today'}</span>
          </button>

          <button
            type="button"
            data-testid="button-timeframe-week"
            onClick={() => { setTimeframe('week'); setCustomDate(''); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              timeframe === 'week'
                ? 'bg-[hsl(38_74%_45%)] text-white shadow-xs'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {language === 'ar' ? 'هذا الأسبوع' : 'This Week'}
          </button>

          <button
            type="button"
            data-testid="button-timeframe-month"
            onClick={() => { setTimeframe('month'); setCustomDate(''); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              timeframe === 'month'
                ? 'bg-[hsl(164_31%_25%)] text-white shadow-xs'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {language === 'ar' ? 'هذا الشهر' : 'This Month'}
          </button>

          {/* Custom Date Input */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2.5 py-1 text-xs">
            <span className="text-[11px] text-muted-foreground">{language === 'ar' ? 'يوم محدد:' : 'Date:'}</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                if (e.target.value) setTimeframe('custom');
                else setTimeframe('all');
              }}
              className="bg-transparent text-xs font-bold outline-none cursor-pointer text-foreground"
            />
            {customDate && (
              <button
                type="button"
                onClick={() => { setCustomDate(''); setTimeframe('all'); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Status Mode Toggle (Delivered vs Confirmed) */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
          <button
            type="button"
            data-testid="button-mode-delivered"
            onClick={() => setStatusMode('delivered')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              statusMode === 'delivered'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('deliveredOnlyMode')}
          </button>
          <button
            type="button"
            data-testid="button-mode-confirmed"
            onClick={() => setStatusMode('confirmed')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
              statusMode === 'confirmed'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('confirmedMode')}
          </button>
        </div>
      </div>

      {summaryQuery.isLoading || analyticsQuery.isLoading ? (
        <PageLoader label={t('gatheringSeason')} />
      ) : summaryQuery.isError || analyticsQuery.isError ? (
        <QueryError retry={() => { summaryQuery.refetch(); analyticsQuery.refetch(); }} />
      ) : (
        <>
          {/* Top KPI Metrics Banner */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('totalDeliveredRevenue')}
                </span>
                <DollarSign size={18} className="text-primary" />
              </div>
              <p className="mt-3 font-mono text-2xl sm:text-3xl font-bold text-foreground">
                {money.format(analytics?.summary?.totalRevenue ?? 0)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {statusMode === 'delivered' ? (language === 'ar' ? 'المبيعات المسلّمة فعلياً' : 'Delivered sales') : (language === 'ar' ? 'شامل الحجوزات المؤكدة' : 'Confirmed bookings')}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('totalWeightSold')}
                </span>
                <Scale size={18} className="text-[hsl(38_74%_55%)]" />
              </div>
              <p className="mt-3 font-mono text-2xl sm:text-3xl font-bold text-foreground">
                {(analytics?.summary?.totalWeightKg ?? 0).toFixed(1)} <span className="text-sm font-sans text-muted-foreground">{language === 'ar' ? 'كجم' : 'kg'}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {language === 'ar' ? 'صافي أوزان الكعك والحلويات' : 'Net sweet weights sold'}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('totalBoxesSold')}
                </span>
                <Package size={18} className="text-[hsl(9_54%_55%)]" />
              </div>
              <p className="mt-3 font-mono text-2xl sm:text-3xl font-bold text-foreground">
                {analytics?.summary?.totalBoxes ?? 0} <span className="text-sm font-sans text-muted-foreground">{language === 'ar' ? 'علبة' : 'boxes'}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {language === 'ar' ? 'العلب الجاهزة والمشكلة' : 'Pre-packed boxes sold'}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('deliveredOrdersCount')}
                </span>
                <ClipboardList size={18} className="text-[hsl(153_38%_40%)]" />
              </div>
              <p className="mt-3 font-mono text-2xl sm:text-3xl font-bold text-foreground">
                {analytics?.summary?.totalOrders ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {language === 'ar' ? 'فواتير تم تحصيلها' : 'Delivered order tickets'}
              </p>
            </div>
          </div>

          {/* Interactive Sold Items Breakdown Table */}
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="border-b border-border p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">
                  {t('soldBreakdownTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('soldBreakdownSubtitle')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search Bar */}
                <div className="relative min-w-[200px]">
                  <Search size={15} className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    data-testid="input-search-sold-sweet"
                    value={searchSweet}
                    onChange={(e) => setSearchSweet(e.target.value)}
                    placeholder={t('searchSoldSweets')}
                    className="w-full rounded-xl bg-muted py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs outline-none focus:ring-2 focus:ring-primary/40 font-medium"
                  />
                  {searchSweet && (
                    <button
                      type="button"
                      onClick={() => setSearchSweet('')}
                      className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* CSV Export Button */}
                <button
                  type="button"
                  data-testid="button-export-sales-csv"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted shadow-2xs transition-all active:scale-95"
                >
                  <Download size={14} />
                  <span>{t('exportReportCsv')}</span>
                </button>
              </div>
            </div>

            {displayedCategories.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground p-6">
                <Package size={36} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs font-semibold">{t('noSalesInPeriod')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right rtl:text-right ltr:text-left text-xs" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  <thead className="bg-muted/50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 sm:px-6">{t('item')}</th>
                      <th className="px-4 py-3">{t('exactWeightsCol')}</th>
                      <th className="px-4 py-3 text-center">{t('ordersCol')}</th>
                      <th className="px-4 py-3">{t('revenueCol')}</th>
                      <th className="px-4 py-3 w-48">{t('salesShare')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayedCategories.map((item, index) => {
                      const isWeighted = item.unit === 'kilo' || (item.totalWeightKg ?? 0) > 0;
                      const hasSales = item.revenue > 0 || (item.quantity > 0);

                      return (
                        <tr
                          key={item.categoryName}
                          data-testid={`row-sold-category-${item.categoryId || index}`}
                          className={`hover:bg-muted/40 transition-colors ${!hasSales ? 'opacity-60' : ''}`}
                        >
                          {/* Sweet Name & Image */}
                          <td className="px-4 py-3 sm:px-6">
                            <div className="flex items-center gap-3">
                              <div className="size-10 rounded-xl overflow-hidden bg-muted shrink-0 border border-border">
                                <img
                                  src={item.imageUrl || getCategoryFallbackImage(item.categoryName)}
                                  alt={item.categoryName}
                                  className="size-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div>
                                <p className="font-bold text-foreground text-sm">{item.categoryName}</p>
                                <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground mt-0.5">
                                  {getUnitBadge(item.unit)}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Amounts & Exact Weights */}
                          <td className="px-4 py-3">
                            {hasSales ? (
                              isWeighted ? (
                                <div>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="font-mono text-base font-bold text-foreground">
                                      {(item.totalWeightKg ?? 0).toFixed(1)}
                                    </span>
                                    <span className="text-xs font-bold text-primary">
                                      {language === 'ar' ? 'كجم صافي' : 'kg net'}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                    {(item.kilosSold ?? 0) > 0 && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                                        {item.kilosSold} × {language === 'ar' ? '1 كجم' : '1kg'}
                                      </span>
                                    )}
                                    {(item.halfKilosSold ?? 0) > 0 && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                                        {item.halfKilosSold} × {language === 'ar' ? '½ كجم' : '0.5kg'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : item.unit === 'box' ? (
                                <div className="font-mono text-sm font-bold text-foreground">
                                  {item.boxesSold || item.quantity} <span className="text-xs font-normal text-muted-foreground">{language === 'ar' ? 'علبة' : 'boxes'}</span>
                                </div>
                              ) : (
                                <div className="font-mono text-sm font-bold text-foreground">
                                  {item.piecesSold || item.quantity} <span className="text-xs font-normal text-muted-foreground">{language === 'ar' ? 'قطعة' : 'pieces'}</span>
                                </div>
                              )
                            ) : (
                              <span className="text-muted-foreground text-[11px]">—</span>
                            )}
                          </td>

                          {/* Orders Count */}
                          <td className="px-4 py-3 text-center">
                            <span className="font-mono font-bold text-xs rounded-full bg-muted px-2.5 py-1">
                              {item.ordersCount ?? 0}
                            </span>
                          </td>

                          {/* Revenue */}
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-sm text-foreground">
                              {money.format(item.revenue)}
                            </span>
                          </td>

                          {/* Revenue Share & Progress Bar */}
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] font-mono">
                                <span className="font-bold text-primary">{item.revenueShare ?? 0}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    index % 2 === 0 ? 'bg-primary' : 'bg-[hsl(38_74%_55%)]'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(item.revenueShare ?? 0, 0))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Charts Row */}
          <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('ordersSevenDays')}
                  </p>
                  <h2 className="mt-1 font-display text-2xl">{t('warmingUp')}</h2>
                </div>
                <BarChart3 className="text-[hsl(9_54%_63%)]" size={23} />
              </div>
              <div className="mt-8 flex h-56 items-end gap-2 border-b border-l border-border px-3 pb-0 sm:gap-4">
                {(analytics?.dailyOrders || []).map((point) => (
                  <div key={point.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div
                      className="relative w-full max-w-12 rounded-t-lg bg-[hsl(38_74%_63%)] transition-all group-hover:bg-[hsl(9_54%_63%)]"
                      style={{ height: `${Math.max((point.orders / maxDaily) * 85, 7)}%` }}
                    >
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono-ui text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                        {point.orders}
                      </span>
                    </div>
                    <span className="font-mono-ui text-[9px] text-muted-foreground">{point.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-[hsl(164_31%_18%)] p-6 text-[hsl(39_45%_94%)] shadow-xs">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">
                {t('countdown')}
              </p>
              <div className="mt-7 flex items-baseline gap-3">
                <span className="font-display text-7xl text-[hsl(38_74%_63%)]">
                  {summaryQuery.data?.daysUntilEid ?? '—'}
                </span>
                <span className="text-sm text-[hsl(39_18%_69%)]">{t('daysLeft')}</span>
              </div>
              <p className="mt-5 text-sm leading-6 text-[hsl(39_18%_69%)]">{t('celebration')}</p>
              <div className="mt-7 flex items-center gap-2 text-xs font-bold text-[hsl(38_74%_63%)]">
                <Sparkles size={14} /> {t('seasonOn')}
              </div>
            </section>
          </div>

          {/* Order Mix Status Cards */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {t('orderMix')}
            </p>
            <h2 className="mt-1 font-display text-2xl">{t('whereStand')}</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {(analytics?.statusTotals || []).map((item) => (
                <div key={item.status} className="flex flex-col justify-between rounded-xl bg-muted p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2.5 rounded-full ${
                        item.status === 'ready'
                          ? 'bg-[hsl(153_28%_48%)]'
                          : item.status === 'pending'
                          ? 'bg-[hsl(38_74%_63%)]'
                          : item.status === 'delivered'
                          ? 'bg-primary'
                          : 'bg-[hsl(9_54%_63%)]'
                      }`}
                    />
                    <span className="text-xs font-semibold">{getStatusLabel(item.status, language)}</span>
                  </div>
                  <span className="mt-3 font-display text-2xl">{item.count}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const permissionOptions: Array<{ key: StaffPermission; label: CopyKey }> = [
  { key: 'orders', label: 'ordersPermission' },
  { key: 'inventory', label: 'inventoryPermission' },
  { key: 'analytics', label: 'analyticsPermission' },
  { key: 'team', label: 'teamPermission' },
];

type ExtendedStaffMember = StaffMember & {
  status?: 'pending' | 'approved' | 'rejected';
};

function TeamPage() {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const usersQuery = useListStaffUsers({
    query: { queryKey: getListStaffUsersQueryKey(), staleTime: 0 },
  });
  const updateUser = useUpdateStaffUser();
  const [drafts, setDrafts] = useState<Record<string, { staffAccess: boolean; permissions: StaffPermission[] }>>({});
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const members = (Array.isArray(usersQuery.data) ? usersQuery.data : []) as ExtendedStaffMember[];

  const getDraft = (member: ExtendedStaffMember) =>
    drafts[member.userId] || { staffAccess: member.staffAccess, permissions: member.permissions };

  const updateDraft = (member: ExtendedStaffMember, patch: Partial<{ staffAccess: boolean; permissions: StaffPermission[] }>) => {
    const current = getDraft(member);
    setDrafts((value) => ({ ...value, [member.userId]: { ...current, ...patch } }));
  };

  const save = (member: ExtendedStaffMember) => {
    const data = getDraft(member);
    updateUser.mutate({ userId: member.userId, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStaffUsersQueryKey() });
      },
      onError: () => {
        alert(language === 'ar' ? 'تعذر حفظ صلاحيات الموظف.' : 'Failed to save staff permissions.');
      },
    });
  };

  const handleApproveStaff = async (member: ExtendedStaffMember) => {
    setActionLoadingId(member.userId);
    try {
      const staffToken = localStorage.getItem('staff_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(staffToken ? { 'x-staff-session': staffToken } : {}),
      };

      const res = await fetch(`/api/staff/users/${member.userId}`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          staffAccess: true,
          status: 'approved',
          permissions: ['orders'],
        }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListStaffUsersQueryKey() });
      } else {
        alert(language === 'ar' ? 'تعذر قبول الموظف' : 'Failed to approve staff');
      }
    } catch {
      alert(language === 'ar' ? 'تعذر الاتصال بالخادم' : 'Failed to connect to server');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectOrDelete = async (member: ExtendedStaffMember, isPending: boolean) => {
    const confirmMsg = isPending
      ? (language === 'ar' ? `هل تريد رفض طلب ${member.name}؟` : `Reject request from ${member.name}?`)
      : (language === 'ar' ? `هل أنت متأكد من حذف حساب ${member.name}؟` : `Delete account for ${member.name}?`);

    if (!window.confirm(confirmMsg)) return;

    setActionLoadingId(member.userId);
    try {
      const staffToken = localStorage.getItem('staff_token');
      const headers: Record<string, string> = {
        ...(staffToken ? { 'x-staff-session': staffToken } : {}),
      };

      const res = await fetch(`/api/staff/users/${member.userId}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListStaffUsersQueryKey() });
      } else {
        alert(language === 'ar' ? 'فشلت العملية' : 'Action failed');
      }
    } catch {
      alert(language === 'ar' ? 'تعذر الاتصال بالخادم' : 'Failed to connect to server');
    } finally {
      setActionLoadingId(null);
    }
  };

  const ownerMembers = members.filter((m) => m.role === 'owner');
  const pendingMembers = members.filter((m) => m.role !== 'owner' && (m.status === 'pending' || !m.staffAccess));
  const approvedStaffMembers = members.filter((m) => m.role !== 'owner' && m.status === 'approved' && m.staffAccess);

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">{t('manageTeam')}</p>
          <h1 className="mt-2 font-display text-4xl">{t('team')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('teamDescription')}</p>
        </div>
        <div className="rounded-xl bg-muted px-4 py-3 text-xs text-muted-foreground">
          {language === 'ar'
            ? 'المالك فقط هو المخول بقبول طلبات انضمام الموظفين وتعديل صلاحياتهم.'
            : 'Only the shop owner can approve staff requests and manage permissions.'}
        </div>
      </div>

      {usersQuery.isLoading ? (
        <PageLoader label={t('loading')} />
      ) : usersQuery.isError ? (
        <div className="mt-8"><QueryError retry={() => usersQuery.refetch()} /></div>
      ) : (
        <div className="space-y-8">
          {/* Section 1: Owner Card */}
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Crown size={15} className="text-[hsl(38_74%_63%)]" />
              {language === 'ar' ? 'حساب مالك المحل الرئيسي (admin)' : 'Main Shop Owner Account (admin)'}
            </h2>
            {ownerMembers.map((owner) => (
              <article key={owner.userId} className="rounded-2xl border-2 border-[hsl(38_74%_63%/0.4)] bg-card p-5 md:p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.2)] text-[hsl(34_65%_35%)] font-bold">
                      <Crown size={24} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-bold text-lg">{owner.name}</h3>
                        <span className="rounded-full bg-[hsl(38_74%_63%/0.2)] px-2.5 py-0.5 text-xs font-extrabold text-[hsl(34_65%_35%)]">
                          {language === 'ar' ? '👑 مالك المحل' : '👑 Shop Owner'}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground mt-0.5" dir="ltr">
                        {owner.email}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPasswordDialogOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90"
                  >
                    <KeyRound size={14} />
                    {language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
                  </button>
                </div>
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {language === 'ar'
                      ? 'المالك يمتلك كافة الصلاحيات للطلبات، المخزون، التحليلات، وإدارة الموظفين.'
                      : 'Owner has full unrestricted permissions for orders, inventory, analytics, and staff.'}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-primary">
                    username: admin
                  </span>
                </div>
              </article>
            ))}
          </div>

          {/* Section 2: Pending Approval Requests */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock3 size={15} className="text-[hsl(9_54%_63%)]" />
                {language === 'ar' ? 'طلبات انضمام الموظفين المعلقة' : 'Pending Staff Join Requests'}
                {pendingMembers.length > 0 && (
                  <span className="rounded-full bg-[hsl(9_54%_63%)] px-2 py-0.5 text-[10px] font-bold text-white">
                    {pendingMembers.length}
                  </span>
                )}
              </h2>
            </div>

            {pendingMembers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-xs text-muted-foreground">
                {language === 'ar'
                  ? 'لا توجد طلبات موظفين قيد الانتظار حاليًا.'
                  : 'No staff join requests pending approval right now.'}
              </div>
            ) : (
              <div className="space-y-3">
                {pendingMembers.map((member) => (
                  <article key={member.userId} className="rounded-2xl border border-[hsl(38_74%_63%/0.4)] bg-[hsl(38_74%_63%/0.04)] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary font-bold">
                          {member.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-semibold">{member.name}</h3>
                            <span className="rounded-full bg-[hsl(38_74%_63%/0.25)] px-2.5 py-0.5 text-[11px] font-bold text-[hsl(34_65%_35%)]">
                              {language === 'ar' ? '⏳ قيد انتظار موافقة المالك' : '⏳ Awaiting Owner Approval'}
                            </span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground" dir="ltr">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={actionLoadingId === member.userId}
                          onClick={() => handleApproveStaff(member)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(153_28%_48%)] px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {actionLoadingId === member.userId ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <UserCheck size={14} />
                          )}
                          {language === 'ar' ? 'قبول وتفعيل الموظف' : 'Approve & Activate'}
                        </button>

                        <button
                          type="button"
                          disabled={actionLoadingId === member.userId}
                          onClick={() => handleRejectOrDelete(member, true)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3 py-2.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <UserX size={14} />
                          {language === 'ar' ? 'رفض' : 'Reject'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Approved Staff Members */}
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Users size={15} />
              {language === 'ar' ? 'الموظفون المعتمدون' : 'Approved Staff Members'}
            </h2>

            {approvedStaffMembers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-xs text-muted-foreground">
                {language === 'ar'
                  ? 'لا يوجد موظفون معتمدون حاليًا. يمكنك قبول الموظفين من قسم الطلبات المعلقة أعلاه.'
                  : 'No approved staff members yet. New staff accounts appear in the pending section above.'}
              </div>
            ) : (
              <div className="space-y-4">
                {approvedStaffMembers.map((member) => {
                  const draft = getDraft(member);
                  return (
                    <article key={member.userId} data-testid={`card-staff-${member.userId}`} className="rounded-2xl border border-border bg-card p-5 md:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary font-bold">
                            {member.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">{member.name}</h3>
                            <p className="truncate text-xs text-muted-foreground" dir="ltr">{member.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${draft.staffAccess ? 'bg-[hsl(153_28%_48%/0.15)] text-[hsl(153_38%_30%)]' : 'bg-muted text-muted-foreground'}`}>
                            {draft.staffAccess ? t('staff') : t('noAccess')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRejectOrDelete(member, false)}
                            disabled={actionLoadingId === member.userId}
                            className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title={language === 'ar' ? 'حذف الموظف' : 'Delete Staff'}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 border-t border-border pt-5">
                        <label className="flex items-center gap-3 text-sm font-bold">
                          <input
                            type="checkbox"
                            checked={draft.staffAccess}
                            onChange={(e) => updateDraft(member, { staffAccess: e.target.checked })}
                            className="size-4 accent-[hsl(164_31%_18%)]"
                          />
                          {draft.staffAccess ? t('enableStaff') : t('disableStaff')}
                        </label>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {permissionOptions.map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm">
                              <input
                                type="checkbox"
                                checked={draft.permissions.includes(key)}
                                onChange={(e) => updateDraft(member, {
                                  permissions: e.target.checked
                                    ? [...draft.permissions, key]
                                    : draft.permissions.filter((item) => item !== key),
                                })}
                                disabled={!draft.staffAccess}
                                className="size-4 accent-[hsl(164_31%_18%)]"
                              />
                              {t(label)}
                            </label>
                          ))}
                        </div>
                        <button
                          data-testid={`button-save-staff-${member.userId}`}
                          onClick={() => save(member)}
                          disabled={updateUser.isPending}
                          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                        >
                          {updateUser.isPending && <Loader2 size={15} className="animate-spin" />} {t('savePermissions')}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ChangePasswordDialog isOpen={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} />
    </div>
  );
}

function BuiltInSignInPage() {
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const { signIn, isSignedIn } = useUnifiedAuth();

  // Tab: 'owner' | 'staff'
  const [activeTab, setActiveTab] = useState<'owner' | 'staff'>('owner');

  // If already signed in, redirect directly to admin
  useEffect(() => {
    if (isSignedIn) {
      setLocation('/admin');
    }
  }, [isSignedIn, setLocation]);

  // Owner state
  const [ownerUsername, setOwnerUsername] = useState('admin');
  const [ownerPassword, setOwnerPassword] = useState('admin');

  // Staff state
  const [staffSubTab, setStaffSubTab] = useState<'login' | 'register'>('login');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');

  // Register state
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  // Status
  const [error, setError] = useState('');
  const [pendingNotice, setPendingNotice] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setPendingNotice(false);

    try {
      const result = await signIn(ownerPassword || 'admin', ownerUsername || 'admin', 'owner');
      if (result.success) {
        setLocation('/admin');
        return;
      }
      setError(result.error || (language === 'ar' ? 'كلمة مرور المالك غير صحيحة' : 'Invalid owner password'));
    } catch {
      setError(language === 'ar' ? 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى' : 'Server connection error, please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdminLogin = async () => {
    setLoading(true);
    setError('');
    setPendingNotice(false);
    try {
      const result = await signIn('admin', 'admin', 'owner');
      if (result.success) {
        setLocation('/admin');
        return;
      }
      setError(result.error || (language === 'ar' ? 'تعذر الدخول كمالك' : 'Failed to sign in as owner'));
    } catch {
      setError(language === 'ar' ? 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى' : 'Server connection error, please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffUsername.trim() || !staffPassword) {
      setError(language === 'ar' ? 'يرجى إدخال اسم المستخدم وكلمة المرور' : 'Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');
    setPendingNotice(false);

    try {
      const result = await signIn(staffPassword, staffUsername.trim(), 'staff');
      if (result.success) {
        setLocation('/admin');
        return;
      }
      if (result.pendingApproval) {
        setPendingNotice(true);
      } else {
        setError(result.error || (language === 'ar' ? 'بيانات الموظف غير صحيحة' : 'Invalid staff credentials'));
      }
    } catch {
      setError(language === 'ar' ? 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى' : 'Server connection error, please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFullName.trim() || !regUsername.trim() || !regPassword) {
      setError(language === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/staff/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: regFullName.trim(),
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setRegSuccess(true);
        setRegFullName('');
        setRegUsername('');
        setRegEmail('');
        setRegPassword('');
      } else {
        setError(data.error || (language === 'ar' ? 'تعذر إرسال طلب الحساب' : 'Failed to submit registration'));
      }
    } catch {
      setError(language === 'ar' ? 'تعذر الاتصال بالخادم' : 'Server connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="surface-grid flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg rounded-[32px] border border-border bg-card p-6 md:p-8 shadow-xl">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[hsl(164_31%_18%/0.1)] text-primary">
            <ShieldCheck size={32} />
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold">
            {language === 'ar' ? 'تسجيل دخول الإدارة والفريق' : 'Admin & Staff Portal'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {language === 'ar' ? 'اختر نوع الحساب للمتابعة إلى لوحة التحكم' : 'Select account type to enter the counter dashboard'}
          </p>
        </div>

        {/* Top 2 Tabs: Owner vs Regular Staff */}
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1.5">
          <button
            type="button"
            data-testid="tab-login-owner"
            onClick={() => {
              setActiveTab('owner');
              setError('');
              setPendingNotice(false);
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition-all ${
              activeTab === 'owner'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Crown size={16} className="text-[hsl(38_74%_63%)]" />
            <span>{language === 'ar' ? '👑 مالك المحل (Owner)' : '👑 Shop Owner'}</span>
          </button>

          <button
            type="button"
            data-testid="tab-login-staff"
            onClick={() => {
              setActiveTab('staff');
              setError('');
              setPendingNotice(false);
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition-all ${
              activeTab === 'staff'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User size={16} className="text-primary" />
            <span>{language === 'ar' ? '👤 موظف المحل (Staff)' : '👤 Regular Staff'}</span>
          </button>
        </div>

        {/* Tab 1: Owner */}
        {activeTab === 'owner' && (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-[hsl(38_74%_63%/0.4)] bg-[hsl(38_74%_63%/0.08)] p-3 text-xs leading-5 text-[hsl(34_65%_35%)]">
              {language === 'ar'
                ? '👑 حساب المالك الرئيسي لديه صلاحية قبول وتفعيل حسابات الموظفين وتغيير كلمة المرور.'
                : '👑 Shop owner account has full authority to approve staff and change passwords.'}
            </div>

            <form onSubmit={handleOwnerSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {language === 'ar' ? 'اسم المستخدم للمالك' : 'Owner Username'}
                </label>
                <input
                  type="text"
                  value={ownerUsername}
                  onChange={(e) => setOwnerUsername(e.target.value)}
                  placeholder="admin"
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {language === 'ar' ? 'كلمة المرور' : 'Password'}
                </label>
                <input
                  type="password"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  placeholder="admin"
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {loading ? (language === 'ar' ? 'جاري الدخول...' : 'Signing in...') : (language === 'ar' ? 'تسجيل الدخول كمالك' : 'Sign In as Owner')}
              </button>

              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={handleQuickAdminLogin}
                  disabled={loading}
                  className="w-full rounded-xl border border-border py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  {language === 'ar' ? '⚡ دخول فوري كمالك (admin / admin)' : '⚡ Quick Owner Login (admin / admin)'}
                </button>
              )}
            </form>
          </div>
        )}

        {/* Tab 2: Regular Staff */}
        {activeTab === 'staff' && (
          <div className="mt-6 space-y-4">
            {/* Staff Sub-tabs: Login vs Register */}
            <div className="flex border-b border-border text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setStaffSubTab('login');
                  setError('');
                  setPendingNotice(false);
                }}
                className={`flex-1 pb-3 text-center border-b-2 transition-colors ${
                  staffSubTab === 'login'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {language === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStaffSubTab('register');
                  setError('');
                  setPendingNotice(false);
                  setRegSuccess(false);
                }}
                className={`flex-1 pb-3 text-center border-b-2 transition-colors ${
                  staffSubTab === 'register'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {language === 'ar' ? 'طلب حساب موظف جديد' : 'Request New Account'}
              </button>
            </div>

            {staffSubTab === 'login' && (
              <form onSubmit={handleStaffSubmit} className="space-y-4 pt-1">
                {pendingNotice && (
                  <div className="rounded-2xl border border-[hsl(38_74%_63%/0.4)] bg-[hsl(38_74%_63%/0.12)] p-4 text-xs font-medium leading-5 text-[hsl(34_65%_35%)]">
                    <p className="font-bold flex items-center gap-1.5 mb-1">
                      <span>⏳</span>
                      {language === 'ar' ? 'حسابك قيد انتظار موافقة المالك' : 'Account Pending Owner Approval'}
                    </p>
                    <p>
                      {language === 'ar'
                        ? 'تم استلام طلبك ولكن لم يقم مالك المحل بتفعيله بعد. يرجى التواصل مع مالك المحل لتفعيل حسابك.'
                        : 'Your account has been requested but not yet approved by the shop owner. Please ask the owner to approve your access.'}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'اسم المستخدم أو البريد الإلكتروني' : 'Username or Email'}
                  </label>
                  <input
                    type="text"
                    required
                    value={staffUsername}
                    onChange={(e) => setStaffUsername(e.target.value)}
                    placeholder={language === 'ar' ? 'مثال: ahmed' : 'e.g. ahmed'}
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'كلمة المرور' : 'Password'}
                  </label>
                  <input
                    type="password"
                    required
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    placeholder="••••••"
                    className="mt-1.5 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? (language === 'ar' ? 'جاري الدخول...' : 'Signing in...') : (language === 'ar' ? 'تسجيل الدخول كموظف' : 'Sign In as Staff')}
                </button>
              </form>
            )}

            {staffSubTab === 'register' && (
              <div>
                {regSuccess ? (
                  <div className="my-4 rounded-2xl border border-[hsl(153_28%_48%/0.3)] bg-[hsl(153_28%_48%/0.1)] p-5 text-center">
                    <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[hsl(153_28%_48%/0.2)] text-[hsl(153_38%_30%)]">
                      <Check size={24} />
                    </div>
                    <h3 className="mt-3 font-display text-lg font-bold text-[hsl(153_38%_30%)]">
                      {language === 'ar' ? 'تم إرسال طلبك بنجاح!' : 'Request Sent Successfully!'}
                    </h3>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {language === 'ar'
                        ? 'حسابك الآن قيد انتظار موافقة مالك المحل (admin). سيتمكن المالك من تفعيل حسابك من لوحة التحكم.'
                        : 'Your account is now pending approval by the shop owner. You will be able to sign in once approved.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRegSuccess(false);
                        setStaffSubTab('login');
                      }}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
                    >
                      {language === 'ar' ? 'الانتقال إلى تسجيل الدخول' : 'Go to Sign In'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleStaffRegister} className="space-y-3 pt-1">
                    <div className="rounded-xl bg-muted/60 p-3 text-[11px] text-muted-foreground leading-4">
                      {language === 'ar'
                        ? '💡 قم بإنشاء طلب حسابك، وسيقوم مالك المحل بقبوله ومنحك الصلاحيات المناسبة.'
                        : '💡 Submit your registration. The shop owner will approve it and grant necessary permissions.'}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground">
                        {language === 'ar' ? 'الاسم بالكامل' : 'Full Name'} *
                      </label>
                      <input
                        type="text"
                        required
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        placeholder={language === 'ar' ? 'مثال: أحمد مصطفى' : 'e.g. Ahmed Mostafa'}
                        className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground">
                        {language === 'ar' ? 'اسم المستخدم' : 'Username'} *
                      </label>
                      <input
                        type="text"
                        required
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        placeholder="ahmed"
                        className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground">
                        {language === 'ar' ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)'}
                      </label>
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="ahmed@example.com"
                        className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted-foreground">
                        {language === 'ar' ? 'كلمة المرور' : 'Password'} *
                      </label>
                      <input
                        type="password"
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="••••••"
                        className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {loading && <Loader2 size={14} className="animate-spin" />}
                      {language === 'ar' ? 'إرسال طلب الحساب للمالك' : 'Submit Registration to Owner'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 border-t border-border pt-4 text-center">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            {language === 'ar' ? '← العودة لمتجر الحلويات' : '← Back to Sweets Shop'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SignInPage() {
  if (isClerkEnabled) {
    return (
      <div className="surface-grid flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
        <div className="w-full">
          <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/admin`} />
        </div>
      </div>
    );
  }
  return <BuiltInSignInPage />;
}

function SignUpPage() {
  if (isClerkEnabled) {
    return (
      <div className="surface-grid flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
        <div className="w-full">
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/admin`} />
        </div>
      </div>
    );
  }
  return <BuiltInSignInPage />;
}

function AdminAccessDenied() {
  const { signOut } = useUnifiedAuth();
  const { t } = useLanguage();
  return <div className="surface-grid flex min-h-[100dvh] items-center justify-center bg-background px-5 py-10"><section className="w-full max-w-lg rounded-[28px] border border-border bg-card p-8 text-center shadow-sm md:p-12"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[hsl(3_58%_48%/0.1)] text-[hsl(3_58%_42%)]"><ShieldCheck size={25} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(9_54%_63%)]">{t('staffOnly')}</p><h1 className="mt-3 font-display text-4xl">{t('teamOnly')}</h1><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{t('noStaffAccess')}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/" className="rounded-xl border border-border px-4 py-3 text-sm font-bold">{t('viewShop')}</Link><button data-testid="button-denied-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{t('signOut')}</button></div></section></div>;
}

function OwnerSetupPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const claimOwner = useClaimOwnerAccess();
  return <div className="surface-grid flex min-h-[100dvh] items-center justify-center bg-background px-5 py-10">
    <section className="w-full max-w-lg rounded-[28px] border border-border bg-card p-8 text-center shadow-sm md:p-12">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.2)] text-[hsl(34_65%_35%)]"><ShieldCheck size={25} /></div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(9_54%_63%)]">{t('staffOnly')}</p>
      <h1 className="mt-3 font-display text-4xl">{t('ownerSetupTitle')}</h1>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{t('ownerSetupDescription')}</p>
      <button data-testid="button-claim-owner" onClick={() => claimOwner.mutate(undefined, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetStaffAccessQueryKey() }) })} disabled={claimOwner.isPending} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
        {claimOwner.isPending && <Loader2 size={16} className="animate-spin" />} {t('activateOwner')}
      </button>
      {claimOwner.isError && <p className="mt-4 text-xs text-[hsl(3_58%_42%)]">{t('ownerSetupError')}</p>}
    </section>
  </div>;
}

function PermissionDenied() {
  const { t } = useLanguage();
  return <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[hsl(3_58%_48%/0.1)] text-[hsl(3_58%_42%)]"><ShieldCheck size={25} /></div>
    <h1 className="mt-5 font-display text-3xl">{t('permissionDenied')}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('permissionDeniedDescription')}</p>
  </div>;
}

function PermissionGuard({ permission, children }: { permission: StaffPermission | StaffPermission[]; children: ReactNode }) {
  const access = useStaffAccess();
  const allowed = Array.isArray(permission)
    ? permission.some((p) => hasPermission(access, p))
    : hasPermission(access, permission);
  return allowed ? <>{children}</> : <PermissionDenied />;
}

function AdminGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUnifiedAuth();
  const staffAccessQuery = useGetStaffAccess({
    query: {
      queryKey: getGetStaffAccessQueryKey(),
      enabled: isLoaded && Boolean(isSignedIn),
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: 15_000,
      staleTime: 0,
    },
  });
  if (!isLoaded) return <PageLoader label="جاري التحقق من صلاحية الدخول" />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (staffAccessQuery.isLoading) return <PageLoader label="جاري التحقق من صلاحية الدخول" />;
  if (staffAccessQuery.isError) {
    const status = (staffAccessQuery.error as { status?: number }).status;
    if (status === 403) return <AdminAccessDenied />;
    if (status === 401) {
      localStorage.removeItem('local_admin_session');
      localStorage.removeItem('staff_token');
      localStorage.removeItem('local_staff_role');
      return <Redirect to="/sign-in" />;
    }
    return <QueryError retry={() => staffAccessQuery.refetch()} />;
  }
  if (isClerkEnabled && staffAccessQuery.data?.setupAvailable) return <OwnerSetupPage />;
  if (!staffAccessQuery.data?.staffAccess) return <AdminAccessDenied />;
  return <StaffAccessProvider access={staffAccessQuery.data}>{children}</StaffAccessProvider>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const currentQueryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) currentQueryClient.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, currentQueryClient]);
  return null;
}

function AdminHome() {
  const access = useStaffAccess();
  if (hasPermission(access, 'analytics')) {
    return <AdminOverview />;
  }
  if (hasPermission(access, 'orders')) {
    return <Redirect to="/admin/orders" />;
  }
  if (hasPermission(access, 'inventory')) {
    return <Redirect to="/admin/categories" />;
  }
  if (hasPermission(access, 'team')) {
    return <Redirect to="/admin/team" />;
  }
  return <PermissionDenied />;
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/track" component={TrackPage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/admin/login"><Redirect to="/sign-in" /></Route>
        <Route path="/admin/register/*?"><Redirect to="/sign-up" /></Route>
        <Route path="/admin"><AdminGuard><AdminShell><AdminHome /></AdminShell></AdminGuard></Route>
        <Route path="/admin/orders"><AdminGuard><AdminShell><PermissionGuard permission="orders"><OrdersPage /></PermissionGuard></AdminShell></AdminGuard></Route>
        <Route path="/admin/stock-demand"><AdminGuard><AdminShell><PermissionGuard permission={['inventory', 'orders']}><StockDemandPage /></PermissionGuard></AdminShell></AdminGuard></Route>
        <Route path="/admin/kitchen"><AdminGuard><AdminShell><PermissionGuard permission="orders"><KitchenPage /></PermissionGuard></AdminShell></AdminGuard></Route>
        <Route path="/admin/categories"><AdminGuard><AdminShell><PermissionGuard permission="inventory"><CategoriesPage /></PermissionGuard></AdminShell></AdminGuard></Route>
        <Route path="/admin/analytics"><AdminGuard><AdminShell><PermissionGuard permission="analytics"><AnalyticsPage /></PermissionGuard></AdminShell></AdminGuard></Route>
        <Route path="/admin/team"><AdminGuard><AdminShell><PermissionGuard permission="team"><TeamPage /></PermissionGuard></AdminShell></AdminGuard></Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function UnifiedAuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [isSignedIn, setIsSignedIn] = useState(
    () => localStorage.getItem('local_admin_session') === 'true' || Boolean(localStorage.getItem('staff_token'))
  );

  const signOut = async (options?: { redirectUrl?: string }) => {
    localStorage.removeItem('local_admin_session');
    localStorage.removeItem('staff_token');
    localStorage.removeItem('local_staff_role');
    try {
      await fetch('/api/staff/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    queryClient.clear();
    setIsSignedIn(false);
    setLocation(options?.redirectUrl ? stripBase(options.redirectUrl) : '/');
  };

  const signIn = async (password: string = 'admin', username?: string, role: 'owner' | 'staff' = 'owner') => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ password, username, role }),
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (role === 'owner') {
          localStorage.setItem('local_admin_session', 'true');
        } else {
          localStorage.removeItem('local_admin_session');
        }
        localStorage.setItem('local_staff_role', role);
        if (data.token) {
          localStorage.setItem('staff_token', data.token);
        }
        setIsSignedIn(true);
        await queryClient.invalidateQueries({ queryKey: getGetStaffAccessQueryKey() });
        return { success: true };
      }
      return {
        success: false,
        error: data.error || (role === 'owner' ? 'كلمة مرور المالك غير صحيحة' : 'بيانات الدخول غير صحيحة'),
        pendingApproval: data.pendingApproval,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      return {
        success: false,
        error: isTimeout
          ? 'استغرق الاتصال بالخادم وقتاً أطول من المعتاد. يرجى إعادة المحاولة.'
          : 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى',
      };
    }
  };

  const value = useMemo(
    () => ({ isLoaded: true, isSignedIn, signOut, signIn }),
    [isSignedIn],
  );

  return <UnifiedAuthContext.Provider value={value}>{children}</UnifiedAuthContext.Provider>;
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  const handleSignOut = async (options?: { redirectUrl?: string }) => {
    await signOut({ redirectUrl: options?.redirectUrl || basePath || '/' });
  };

  const value = useMemo(
    () => ({
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      signOut: handleSignOut,
      signIn: async () => ({ success: true }),
    }),
    [isLoaded, isSignedIn, signOut],
  );

  return <UnifiedAuthContext.Provider value={value}>{children}</UnifiedAuthContext.Provider>;
}

function AppWithAuth() {
  const [, setLocation] = useLocation();

  if (isClerkEnabled) {
    return (
      <ClerkProvider
        publishableKey={clerkPubKey}
        proxyUrl={clerkProxyUrl}
        appearance={clerkAppearance}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        localization={{
          signIn: { start: { title: 'أهلًا بعودتك', subtitle: 'سجّل الدخول لفتح المحل' } },
          signUp: { start: { title: 'انضم لفريق المحل', subtitle: 'أنشئ صلاحية المحل' } },
        }}
        routerPush={(to) => setLocation(stripBase(to))}
        routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      >
        <QueryClientProvider client={queryClient}>
          <ClerkBridge>
            <ClerkQueryClientCacheInvalidator />
            <Router />
          </ClerkBridge>
        </QueryClientProvider>
      </ClerkProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <UnifiedAuthProvider>
        <Router />
      </UnifiedAuthProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <LanguageProvider>
        <WouterRouter base={basePath}>
          <AppWithAuth />
        </WouterRouter>
      </LanguageProvider>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;