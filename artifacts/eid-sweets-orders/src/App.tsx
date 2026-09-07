import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Archive,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Menu,
  Package,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  getExportOrdersQueryKey,
  getGetDashboardAnalyticsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetOrderQueryKey,
  getListCategoriesQueryKey,
  getListOrdersQueryKey,
  getTrackOrderQueryKey,
  type Category,
  type DashboardAnalytics,
  type DashboardSummary,
  type Order,
  type OrderStatus,
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
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import './index.css';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

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
    fontFamily: 'Manrope, sans-serif',
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
const money = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' });
const statusLabels: Record<string, string> = {
  pending: 'New request',
  accepted: 'Accepted',
  rejected: 'Declined',
  preparing: 'In the kitchen',
  ready: 'Ready for pickup',
  delivered: 'Collected',
};
const statusTone: Record<string, string> = {
  pending: 'bg-[hsl(38_74%_63%/0.2)] text-[hsl(164_31%_18%)]',
  accepted: 'bg-[hsl(153_28%_48%/0.15)] text-[hsl(153_38%_30%)]',
  rejected: 'bg-[hsl(3_58%_48%/0.12)] text-[hsl(3_58%_42%)]',
  preparing: 'bg-[hsl(207_42%_88%)] text-[hsl(207_42%_30%)]',
  ready: 'bg-[hsl(34_65%_48%/0.18)] text-[hsl(34_65%_35%)]',
  delivered: 'bg-[hsl(164_31%_18%/0.1)] text-[hsl(164_31%_28%)]',
};
const unitLabels: Record<string, string> = { kilo: 'kg', box: 'box', piece: 'piece' };

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-mark">
      <div className={`relative grid size-10 place-items-center rounded-[14px] ${light ? 'bg-[hsl(38_74%_63%)] text-[hsl(164_31%_18%)]' : 'bg-[hsl(164_31%_18%)] text-[hsl(38_74%_63%)]'}`}>
        <Sparkles size={18} strokeWidth={2.2} />
        <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[hsl(9_54%_63%)]" />
      </div>
      <div>
        <p className={`font-display text-lg leading-none ${light ? 'text-[hsl(39_45%_94%)]' : 'text-[hsl(164_31%_18%)]'}`}>Saffron & Seed</p>
        <p className={`mt-1 text-[10px] font-bold uppercase tracking-[0.22em] ${light ? 'text-[hsl(39_18%_69%)]' : 'text-[hsl(164_14%_46%)]'}`}>Eid sweets counter</p>
      </div>
    </div>
  );
}

function PageLoader({ label = 'Bringing up the counter' }: { label?: string }) {
  return <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-sm text-muted-foreground"><div className="skeleton h-2 w-32 rounded-full" /><div className="skeleton h-2 w-24 rounded-full" /><span>{label}</span></div>;
}

function QueryError({ retry }: { retry?: () => void }) {
  return <div className="rounded-2xl border border-[hsl(3_58%_48%/0.25)] bg-[hsl(3_58%_48%/0.06)] p-6 text-center"><p className="font-semibold text-[hsl(3_58%_42%)]">We could not reach the counter.</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>{retry && <button data-testid="button-retry" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><RefreshCw size={15} /> Try again</button>}</div>;
}

function StatusPill({ status }: { status: string }) {
  return <span data-testid={`status-${status}`} className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${statusTone[status] || statusTone.pending}`}>{statusLabels[status] || status}</span>;
}

function AdminShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut } = useClerk();
  const links = [
    { href: '/admin', label: 'Overview', icon: BarChart3 },
    { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
    { href: '/admin/categories', label: 'Categories & stock', icon: Package },
    { href: '/admin/analytics', label: 'Analytics', icon: TrendingUp },
  ];
  return <div className="min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 w-[264px] -translate-x-full bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : ''}`}>
      <div className="flex items-center justify-between"><Logo light /><button data-testid="button-close-sidebar" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-sidebar-foreground/70 md:hidden"><X size={18} /></button></div>
      <div className="mt-12 space-y-1">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/45">Workspace</p>
        {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${location === href ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}><Icon size={18} /><span>{label}</span>{href === '/admin/orders' && <span className="ml-auto rounded-full bg-[hsl(9_54%_63%)] px-1.5 py-0.5 text-[10px] text-white">live</span>}</Link>)}
      </div>
      <div className="absolute bottom-6 left-5 right-5 rounded-2xl border border-sidebar-border bg-sidebar-accent p-4"><div className="flex items-center gap-2 text-sidebar-primary"><ShieldCheck size={16} /><span className="text-xs font-bold">Pickup desk mode</span></div><p className="mt-2 text-xs leading-5 text-sidebar-foreground/60">Orders stay tidy from first request to family collection.</p><Link href="/" data-testid="link-view-shop" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sidebar-primary">View shop <ArrowRight size={13} /></Link></div>
    </aside>
    {mobileOpen && <button data-testid="button-sidebar-overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[hsl(164_31%_18%/0.35)] md:hidden" aria-label="Close menu" />}
    <div className="md:pl-[264px]">
      <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:px-8"><div className="flex items-center gap-3"><button data-testid="button-open-sidebar" onClick={() => setMobileOpen(true)} className="rounded-xl border border-border p-2 md:hidden"><Menu size={19} /></button><div className="hidden md:block"><p className="font-display text-lg">Good morning, counter team.</p><p className="text-xs text-muted-foreground">A clear queue makes a calmer Eid.</p></div></div><div className="flex items-center gap-2 sm:gap-3"><Link href="/track" data-testid="link-track-public" className="hidden items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted sm:flex"><ExternalLink size={14} /> Public tracker</Link><button data-testid="button-notifications" className="relative rounded-xl border border-border p-2.5 text-muted-foreground hover:bg-muted"><Bell size={17} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[hsl(9_54%_63%)]" /></button><div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-bold">AM</div><button data-testid="button-admin-sign-out" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">Sign out</button></div></header>
      <main className="p-4 md:p-8">{children}</main>
    </div>
  </div>;
}

function PublicHeader() {
  return <header className="flex items-center justify-between px-5 py-5 md:px-10"><Link href="/" data-testid="link-home-logo"><Logo /></Link><nav className="flex items-center gap-2 text-sm font-semibold"><Link href="/track" data-testid="link-track-order" className="rounded-xl px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">Track an order</Link><Link href="/admin/login" data-testid="link-staff-login" className="hidden rounded-xl border border-border px-3 py-2 sm:block">Staff sign in</Link></nav></header>;
}

function HomePage() {
  const categoriesQuery = useListCategories();
  const createOrder = useCreateOrder();
  const [cart, setCart] = useState<Record<number, number>>({});
  const [step, setStep] = useState<'shop' | 'details' | 'success'>('shop');
  const [customer, setCustomer] = useState({ name: '', phone: '', date: '', time: '11:00', notes: '' });
  const activeCategories = (categoriesQuery.data || []).filter((category) => category.isActive !== false);
  const cartLines = activeCategories.filter((category) => cart[category.id]);
  const total = cartLines.reduce((sum, category) => sum + (cart[category.id] || 0) * category.pricePerUnit, 0);
  const orderPayload = { customerName: customer.name, phoneNumber: customer.phone, pickupDate: customer.date, pickupTime: customer.time, notes: customer.notes || undefined, createdBy: 'guest' as const, items: cartLines.map((category) => ({ categoryId: category.id, quantity: cart[category.id] })) };
  const add = (id: number, amount: number) => setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] || 0) + amount) }));
  const submit = () => createOrder.mutate({ data: orderPayload }, { onSuccess: () => setStep('success') });
  return <div className="min-h-[100dvh] bg-background surface-grid"><PublicHeader /><main className="mx-auto max-w-6xl px-5 pb-16 md:px-10">
    {step === 'shop' && <><section className="grid items-end gap-10 pb-14 pt-12 md:grid-cols-[1.15fr_.85fr] md:pt-20"><div className="animate-rise"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[hsl(38_74%_63%/0.5)] bg-[hsl(38_74%_63%/0.15)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em]"><Sparkles size={13} /> Made for your Eid table</div><h1 className="max-w-2xl font-display text-5xl leading-[0.98] tracking-[-0.04em] text-[hsl(164_31%_18%)] md:text-7xl">Sweet things,<br /><span className="text-[hsl(9_54%_55%)]">kept simple.</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">Small-batch mithai, packed with care in our neighborhood kitchen. Choose a pickup slot and we will have your box ready when the family arrives.</p><div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold"><div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-sm"><Clock3 size={16} className="text-[hsl(9_54%_63%)]" /> Same-day pickup</div><div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-sm"><ShieldCheck size={16} className="text-[hsl(153_28%_48%)]" /> No payment online</div></div></div><div className="relative overflow-hidden rounded-[28px] bg-[hsl(164_31%_18%)] p-7 text-[hsl(39_45%_94%)] warm-shadow md:min-h-[280px]"><div className="absolute -right-12 -top-16 size-48 rounded-full border-[22px] border-[hsl(38_74%_63%/0.25)]" /><div className="absolute -bottom-24 -left-8 size-48 rounded-full border-[30px] border-[hsl(9_54%_63%/0.18)]" /><p className="relative text-xs font-bold uppercase tracking-[0.18em] text-[hsl(38_74%_63%)]">This week at the counter</p><p className="relative mt-12 max-w-xs font-display text-3xl leading-tight">“The box arrived before the aunties did.”</p><p className="relative mt-5 text-sm text-[hsl(39_18%_69%)]">— Mariam, Northbridge</p></div></section>
      <section className="grid gap-5 md:grid-cols-[1fr_340px]"><div><div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">The sweet shelf</p><h2 className="mt-1 font-display text-3xl">Build your box</h2></div><span className="text-sm text-muted-foreground">{cartLines.length} selections</span></div>{categoriesQuery.isLoading ? <PageLoader /> : categoriesQuery.isError ? <QueryError retry={() => categoriesQuery.refetch()} /> : activeCategories.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">The shelf is being restocked. Please check back shortly.</div> : <div className="grid gap-3 sm:grid-cols-2">{activeCategories.map((category, index) => <div key={category.id} data-testid={`card-category-${category.id}`} className="lift flex min-h-[150px] flex-col justify-between rounded-2xl border border-border bg-card p-5" style={{ animationDelay: `${index * 60}ms` }}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{category.name}</h3><p className="mt-1 text-xs text-muted-foreground">{money.format(category.pricePerUnit)} / {unitLabels[category.unit]}</p></div><div className="grid size-9 place-items-center rounded-xl bg-[hsl(9_54%_63%/0.12)] text-[hsl(9_54%_55%)]"><ShoppingBag size={17} /></div></div><div className="mt-5 flex items-center justify-between"><span className={`text-xs ${category.stockQuantity <= (category.lowStockThreshold || 0) ? 'font-bold text-[hsl(3_58%_48%)]' : 'text-muted-foreground'}`}>{category.stockQuantity > 0 ? `${category.stockQuantity} ${unitLabels[category.unit]} left` : 'Sold out'}</span><div className="flex items-center gap-2">{cart[category.id] ? <><button data-testid={`button-decrease-${category.id}`} onClick={() => add(category.id, -1)} className="grid size-8 place-items-center rounded-lg border border-border font-bold">−</button><span data-testid={`text-quantity-${category.id}`} className="w-5 text-center text-sm font-bold">{cart[category.id]}</span></> : null}<button data-testid={`button-add-${category.id}`} disabled={category.stockQuantity <= 0 || (cart[category.id] || 0) >= category.stockQuantity} onClick={() => add(category.id, 1)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">{cart[category.id] ? <Plus size={14} /> : 'Add to box'}</button></div></div></div>)}</div>}</div>
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 md:sticky md:top-24"><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Your box</p>{cartLines.length === 0 ? <div className="py-10 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><ShoppingBag size={20} /></div><p className="mt-3 text-sm font-semibold">Nothing tucked in yet</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Add a sweet from the shelf to start your Eid box.</p></div> : <><div className="mt-5 space-y-3">{cartLines.map((category) => <div key={category.id} className="flex justify-between text-sm"><span>{cart[category.id]} × {category.name}</span><span className="font-mono-ui text-xs">{money.format(cart[category.id] * category.pricePerUnit)}</span></div>)}</div><div className="my-5 border-t border-dashed border-border" /><div className="flex items-center justify-between"><span className="font-semibold">Estimated total</span><span data-testid="text-cart-total" className="font-display text-2xl">{money.format(total)}</span></div><button data-testid="button-checkout" onClick={() => setStep('details')} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(9_54%_55%)] px-4 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.01]">Choose pickup details <ArrowRight size={16} /></button></>}</aside></section></>}
    {step === 'details' && <OrderDetails customer={customer} setCustomer={setCustomer} total={total} onBack={() => setStep('shop')} onSubmit={submit} isPending={createOrder.isPending} error={createOrder.isError} />}
    {step === 'success' && <OrderSuccess />}
  </main></div>;
}

function OrderDetails({ customer, setCustomer, total, onBack, onSubmit, isPending, error }: { customer: { name: string; phone: string; date: string; time: string; notes: string }; setCustomer: (value: { name: string; phone: string; date: string; time: string; notes: string }) => void; total: number; onBack: () => void; onSubmit: () => void; isPending: boolean; error: boolean }) {
  const update = (key: keyof typeof customer, value: string) => setCustomer({ ...customer, [key]: value });
  const valid = customer.name.trim().length >= 2 && customer.phone.trim().length >= 7 && customer.date && customer.time;
  return <section className="mx-auto max-w-4xl py-10 md:py-20"><button data-testid="button-back-shop" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground"><ArrowRight size={15} className="rotate-180" /> Back to sweets</button><div className="grid gap-8 md:grid-cols-[1fr_300px]"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">Almost there</p><h1 className="mt-2 font-display text-4xl">Tell us where to meet you.</h1><p className="mt-3 text-sm text-muted-foreground">We will hold your order at the counter under your name.</p><div className="mt-8 space-y-5"><label className="block text-sm font-bold">Your name<input data-testid="input-customer-name" value={customer.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Amina Rahman" className="mt-2 w-full rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" /></label><label className="block text-sm font-bold">Mobile number<input data-testid="input-customer-phone" value={customer.phone} onChange={(e) => update('phone', e.target.value)} placeholder="For pickup updates" className="mt-2 w-full rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" /></label><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-bold">Pickup date<input data-testid="input-pickup-date" type="date" value={customer.date} onChange={(e) => update('date', e.target.value)} min={new Date().toISOString().split('T')[0]} className="mt-2 w-full rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary" /></label><label className="block text-sm font-bold">Pickup time<select data-testid="select-pickup-time" value={customer.time} onChange={(e) => update('time', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary">{['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map((time) => <option key={time} value={time}>{time}</option>)}</select></label></div><label className="block text-sm font-bold">A note for the kitchen <span className="font-normal text-muted-foreground">(optional)</span><textarea data-testid="input-order-notes" value={customer.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Allergies, a family name for the box, or a kind word..." rows={4} className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary" /></label></div></div><aside className="h-fit rounded-2xl bg-[hsl(164_31%_18%)] p-5 text-[hsl(39_45%_94%)]"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">Order total</p><p className="mt-3 font-display text-4xl">{money.format(total)}</p><p className="mt-3 text-xs leading-5 text-[hsl(39_18%_69%)]">Payment happens in person at pickup. We will confirm your slot by phone if anything needs adjusting.</p><button data-testid="button-place-order" disabled={!valid || isPending} onClick={onSubmit} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(38_74%_63%)] px-4 py-3 text-sm font-bold text-[hsl(164_31%_18%)] disabled:opacity-45">{isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {isPending ? 'Sending request...' : 'Place pickup request'}</button>{error && <p className="mt-3 text-xs text-[hsl(9_54%_63%)]">We could not save that request. Please try again.</p>}</aside></div></section>;
}

function OrderSuccess() {
  return <section className="mx-auto max-w-xl py-20 text-center"><div className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[hsl(153_28%_48%/0.16)] text-[hsl(153_38%_30%)]"><Check size={30} /></div><p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(9_54%_63%)]">Request received</p><h1 className="mt-3 font-display text-5xl">Your sweets are on the list.</h1><p className="mx-auto mt-4 max-w-md leading-7 text-muted-foreground">We have sent the pickup request to our counter team. Keep your order number handy — we will use it to find your box.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/track" data-testid="link-track-success" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Track my order <ArrowRight size={16} /></Link><Link href="/" data-testid="link-order-another" className="rounded-xl border border-border px-5 py-3 text-sm font-bold">Order another box</Link></div></section>;
}

function TrackPage() {
  const [mode, setMode] = useState<'orderNumber' | 'phone'>('orderNumber');
  const [value, setValue] = useState('');
  const [params, setParams] = useState<{ orderNumber?: string; phone?: string }>({});
  const trackQuery = useTrackOrder(params, { query: { enabled: Boolean(params.orderNumber || params.phone), queryKey: getTrackOrderQueryKey(params) } });
  const orders = trackQuery.data || [];
  return <div className="min-h-[100dvh] bg-background surface-grid"><PublicHeader /><main className="mx-auto max-w-4xl px-5 pb-20 pt-12 md:px-10 md:pt-24"><div className="mx-auto max-w-xl text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.25)] text-[hsl(164_31%_18%)]"><Search size={22} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(9_54%_63%)]">A calm pickup starts here</p><h1 className="mt-3 font-display text-5xl">Find your order.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Use the order number from your confirmation, or the mobile number you left with us.</p><div className="mt-8 rounded-2xl border border-border bg-card p-2 shadow-sm"><div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"><button data-testid="button-track-order-number" onClick={() => setMode('orderNumber')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'orderNumber' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Order number</button><button data-testid="button-track-phone" onClick={() => setMode('phone')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'phone' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Mobile number</button></div><div className="mt-3 flex gap-2"><input data-testid="input-track-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === 'orderNumber' ? 'e.g. EID-2048' : 'e.g. 04 1234 5678'} className="min-w-0 flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary" /><button data-testid="button-find-order" disabled={!value.trim() || trackQuery.isFetching} onClick={() => setParams(mode === 'orderNumber' ? { orderNumber: value.trim() } : { phone: value.trim() })} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40">{trackQuery.isFetching ? <Loader2 size={17} className="animate-spin" /> : 'Find'}</button></div></div></div>{trackQuery.isError && <div className="mx-auto mt-8 max-w-xl"><QueryError retry={() => trackQuery.refetch()} /></div>}{params.orderNumber || params.phone ? !trackQuery.isLoading && !trackQuery.isError && orders.length === 0 ? <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-dashed border-border p-10 text-center"><p className="font-display text-2xl">No order found</p><p className="mt-2 text-sm text-muted-foreground">Check the details and try once more, or call the shop if you are already at the counter.</p></div> : <div className="mt-10 space-y-4">{orders.map((order) => <TrackCard key={order.id} order={order} />)}</div> : null}</main></div>;
}

function TrackCard({ order }: { order: Order }) {
  const statuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'delivered'];
  const currentIndex = statuses.indexOf(order.status);
  return <article data-testid={`card-tracked-order-${order.id}`} className="rounded-2xl border border-border bg-card p-5 md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono-ui text-xs text-muted-foreground">{order.orderNumber}</p><h2 className="mt-1 font-display text-3xl">{statusLabels[order.status]}</h2></div><StatusPill status={order.status} /></div><div className="mt-8 flex items-start">{statuses.map((status, index) => <div key={status} className="flex flex-1 flex-col items-center gap-2 text-center"><div className={`relative grid size-8 place-items-center rounded-full border-2 ${index <= currentIndex ? 'border-[hsl(38_74%_63%)] bg-[hsl(38_74%_63%)] text-[hsl(164_31%_18%)]' : 'border-border text-muted-foreground'}`}>{index < currentIndex ? <Check size={14} /> : <span className="text-[10px]">{index + 1}</span>}{index < statuses.length - 1 && <span className={`absolute left-7 top-1/2 h-0.5 w-[calc(100%+2rem)] -translate-y-1/2 ${index < currentIndex ? 'bg-[hsl(38_74%_63%)]' : 'bg-border'}`} />}</div><span className="text-[10px] font-bold leading-4 text-muted-foreground">{statusLabels[status]}</span></div>)}</div><div className="mt-7 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Pickup</p><p className="mt-1 font-semibold">{order.pickupDate} at {order.pickupTime}</p></div><div><p className="text-xs text-muted-foreground">For</p><p className="mt-1 font-semibold">{order.customerName}</p></div><div><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-mono-ui text-xs font-bold">{money.format(order.totalPrice)}</p></div></div></article>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'gold' }: { label: string; value: string | number; detail: string; icon: typeof BarChart3; tone?: 'gold' | 'rose' | 'green' | 'blue' }) {
  const colors = { gold: 'bg-[hsl(38_74%_63%/0.17)] text-[hsl(34_65%_40%)]', rose: 'bg-[hsl(9_54%_63%/0.14)] text-[hsl(9_54%_50%)]', green: 'bg-[hsl(153_28%_48%/0.14)] text-[hsl(153_38%_30%)]', blue: 'bg-[hsl(207_42%_88%)] text-[hsl(207_42%_30%)]' };
  return <div data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="lift rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between"><span className={`grid size-9 place-items-center rounded-xl ${colors[tone]}`}><Icon size={17} /></span><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Live</span></div><p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-3xl">{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></div>;
}

function AdminOverview() {
  const summaryQuery = useGetDashboardSummary();
  const ordersQuery = useListOrders({ date: new Date().toISOString().slice(0, 10) });
  const summary = summaryQuery.data as DashboardSummary | undefined;
  if (summaryQuery.isLoading) return <PageLoader label="Reading today’s counter" />;
  if (summaryQuery.isError) return <QueryError retry={() => summaryQuery.refetch()} />;
  const todaysOrders = ordersQuery.data || [];
  return <div className="mx-auto max-w-[1440px]"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">Tuesday, 25 March</p><h1 className="mt-2 font-display text-4xl md:text-5xl">Counter overview</h1><p className="mt-2 text-sm text-muted-foreground">The small details that keep a big family day moving.</p></div><Link href="/admin/orders" data-testid="link-open-queue" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Open order queue <ArrowRight size={16} /></Link></div><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Needs a reply" value={summary?.pendingOrders ?? 0} detail="New pickup requests" icon={Bell} tone="gold" /><MetricCard label="Today’s pickups" value={summary?.todayOrders ?? 0} detail="Across all time slots" icon={CalendarDays} tone="blue" /><MetricCard label="Accepted revenue" value={money.format(summary?.acceptedRevenue ?? 0)} detail="Confirmed orders" icon={TrendingUp} tone="green" /><MetricCard label="Low stock items" value={summary?.lowStockCount ?? 0} detail="Worth checking today" icon={Package} tone="rose" /></div><div className="mt-8 grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><section className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Pickup queue</p><h2 className="mt-1 font-display text-2xl">Today at the counter</h2></div><Link href="/admin/orders" data-testid="link-view-all-orders" className="text-xs font-bold text-[hsl(9_54%_55%)]">View all</Link></div>{ordersQuery.isLoading ? <PageLoader label="Loading today’s queue" /> : todaysOrders.length === 0 ? <EmptyQueue /> : <div className="mt-5 divide-y divide-border">{todaysOrders.slice(0, 6).map((order) => <OrderRow key={order.id} order={order} />)}</div>}</section><section className="rounded-2xl bg-[hsl(164_31%_18%)] p-6 text-[hsl(39_45%_94%)]"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">Eid readiness</p><h2 className="mt-2 font-display text-3xl">Keep the joy moving.</h2></div><Sparkles size={24} className="text-[hsl(38_74%_63%)]" /></div><div className="mt-10 flex items-end gap-3"><span className="font-display text-7xl text-[hsl(38_74%_63%)]">{summary?.daysUntilEid ?? '—'}</span><span className="pb-3 text-sm text-[hsl(39_18%_69%)]">days until Eid</span></div><div className="mt-6 border-t border-sidebar-border pt-5"><div className="flex justify-between text-sm"><span className="text-[hsl(39_18%_69%)]">Top seller</span><span className="font-semibold">{summary?.topCategory || 'Not enough data yet'}</span></div><Link href="/admin/analytics" data-testid="link-see-analytics" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[hsl(38_74%_63%)]">See the full picture <ArrowRight size={15} /></Link></div></section></div></div>;
}

function EmptyQueue() {
  return <div className="my-8 rounded-xl border border-dashed border-border p-8 text-center"><Clock3 className="mx-auto text-muted-foreground" size={23} /><p className="mt-3 font-semibold">The queue is clear.</p><p className="mt-1 text-sm text-muted-foreground">New pickup requests will land here.</p></div>;
}

function OrderRow({ order, onClick }: { order: Order; onClick?: () => void }) {
  return <button type="button" data-testid={`row-order-${order.id}`} onClick={onClick} className="flex w-full items-center justify-between gap-3 py-4 text-left hover:bg-muted/50"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold">{order.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{order.customerName}</p><p className="mt-0.5 font-mono-ui text-[10px] text-muted-foreground">{order.orderNumber} · {order.pickupTime}</p></div></div><div className="flex shrink-0 items-center gap-3"><StatusPill status={order.status} /><span className="hidden font-mono-ui text-xs sm:block">{money.format(order.totalPrice)}</span></div></button>;
}

function OrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const params = useMemo(() => ({ ...(search ? { search } : {}), ...(status ? { status } : {}) }), [search, status]);
  const ordersQuery = useListOrders(params);
  const exportQuery = useExportOrders({ range: 'week' }, { query: { enabled: false, queryKey: getExportOrdersQueryKey({ range: 'week' }) } });
  const updateOrder = useUpdateOrder();
  const selectedQuery = useGetOrder(selectedId ?? 0, { query: { enabled: selectedId !== null, queryKey: getGetOrderQueryKey(selectedId ?? 0) } });
  const orders = ordersQuery.data || [];
  const changeStatus = (order: Order, next: OrderStatus) => updateOrder.mutate({ orderId: order.id, data: { status: next } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) }); } });
  const exportCsv = async () => { const result = await exportQuery.refetch(); if (result.data) { const url = URL.createObjectURL(new Blob([result.data], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'saffron-seed-orders.csv'; anchor.click(); URL.revokeObjectURL(url); } };
  return <div className="mx-auto max-w-[1440px]"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">Operations</p><h1 className="mt-2 font-display text-4xl">Order queue</h1><p className="mt-2 text-sm text-muted-foreground">A single view of every box moving through the kitchen.</p></div><button data-testid="button-export-orders" onClick={exportCsv} disabled={exportQuery.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold">{exportQuery.isFetching ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export this week</button></div><div className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 md:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input data-testid="input-order-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, order number or phone" className="w-full rounded-xl bg-muted py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring/30" /></div><div className="flex items-center gap-2 overflow-auto"><Filter size={15} className="ml-2 shrink-0 text-muted-foreground" /><button data-testid="button-filter-all" onClick={() => setStatus(undefined)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${!status ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>All orders</button>{(['pending', 'accepted', 'preparing', 'ready', 'delivered', 'rejected'] as OrderStatus[]).map((item) => <button key={item} data-testid={`button-filter-${item}`} onClick={() => setStatus(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${status === item ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{statusLabels[item]}</button>)}</div></div><div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">{ordersQuery.isLoading ? <PageLoader label="Loading orders" /> : ordersQuery.isError ? <div className="p-6"><QueryError retry={() => ordersQuery.refetch()} /></div> : orders.length === 0 ? <div className="p-14 text-center"><Archive className="mx-auto text-muted-foreground" size={25} /><p className="mt-3 font-display text-2xl">No orders match that view.</p><p className="mt-1 text-sm text-muted-foreground">Try clearing the search or choosing another status.</p></div> : <><div className="hidden grid-cols-[1.3fr_.9fr_.75fr_.75fr_.7fr] gap-4 border-b border-border bg-muted/60 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:grid"><span>Customer</span><span>Pickup</span><span>Placed</span><span>Status</span><span className="text-right">Total</span></div><div className="divide-y divide-border">{orders.map((order) => <div key={order.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.3fr_.9fr_.75fr_.75fr_.7fr] md:items-center md:gap-4"><button type="button" data-testid={`button-open-order-${order.id}`} onClick={() => setSelectedId(order.id)} className="flex min-w-0 items-center gap-3 text-left"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold">{order.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{order.customerName}</p><p className="font-mono-ui text-[10px] text-muted-foreground">{order.orderNumber} · {order.phoneNumber}</p></div></button><div className="flex items-center gap-2 text-sm md:block"><CalendarDays size={14} className="text-muted-foreground md:hidden" /><span>{order.pickupDate} · {order.pickupTime}</span></div><span className="hidden text-xs text-muted-foreground md:block">{new Date(order.createdAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}</span><div><select data-testid={`select-status-${order.id}`} value={order.status} onChange={(e) => changeStatus(order, e.target.value as OrderStatus)} disabled={updateOrder.isPending} className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-bold outline-none ${statusTone[order.status]}`}><option value="pending">New request</option><option value="accepted">Accepted</option><option value="rejected">Declined</option><option value="preparing">In the kitchen</option><option value="ready">Ready for pickup</option><option value="delivered">Collected</option></select></div><span className="font-mono-ui text-xs font-bold md:text-right">{money.format(order.totalPrice)}</span></div>)}</div></>}</div>{selectedId !== null && <OrderDetail order={selectedQuery.data} isLoading={selectedQuery.isLoading} onClose={() => setSelectedId(null)} onStatus={changeStatus} />}</div>;
}

function OrderDetail({ order, isLoading, onClose, onStatus }: { order?: Order; isLoading: boolean; onClose: () => void; onStatus: (order: Order, status: OrderStatus) => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(164_31%_18%/0.35)] p-0 sm:items-center sm:p-5"><div className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Order detail</p>{order && <h2 className="mt-1 font-display text-3xl">{order.orderNumber}</h2>}</div><button data-testid="button-close-order-detail" onClick={onClose} className="rounded-xl border border-border p-2"><X size={17} /></button></div>{isLoading ? <PageLoader label="Loading order detail" /> : order ? <><div className="mt-6 rounded-2xl bg-muted p-4"><div className="flex justify-between"><span className="text-sm font-bold">{order.customerName}</span><StatusPill status={order.status} /></div><p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Phone size={13} /> {order.phoneNumber}</p><p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays size={13} /> {order.pickupDate} at {order.pickupTime}</p></div><div className="mt-5 space-y-3">{order.items.map((item) => <div key={item.id} className="flex justify-between text-sm"><span>{item.quantity} {unitLabels[item.unit]} · {item.categoryName}</span><span className="font-mono-ui text-xs">{money.format(item.subtotal)}</span></div>)}</div>{order.notes && <div className="mt-5 border-l-2 border-[hsl(38_74%_63%)] pl-3 text-sm italic text-muted-foreground">“{order.notes}”</div>}<div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="font-bold">Total</span><span className="font-display text-2xl">{money.format(order.totalPrice)}</span></div><div className="mt-5 flex flex-wrap gap-2">{order.status === 'pending' && <button data-testid="button-accept-order" onClick={() => onStatus(order, 'accepted')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Accept order</button>}{order.status === 'accepted' && <button data-testid="button-start-order" onClick={() => onStatus(order, 'preparing')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Start preparing</button>}{order.status === 'preparing' && <button data-testid="button-mark-ready" onClick={() => onStatus(order, 'ready')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Mark ready</button>}{order.status === 'ready' && <button data-testid="button-mark-collected" onClick={() => onStatus(order, 'delivered')} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Mark collected</button>}<button data-testid="button-decline-order" onClick={() => onStatus(order, 'rejected')} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-[hsl(3_58%_42%)]">Decline</button></div></> : <QueryError />}</div></div>;
}

function CategoriesPage() {
  const queryClient = useQueryClient();
  const categoriesQuery = useListCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', unit: 'box', price: '', stock: '', threshold: '' });
  const openForm = (category: Category | 'new') => { setEditing(category); setForm(category === 'new' ? { name: '', unit: 'box', price: '', stock: '', threshold: '5' } : { name: category.name, unit: category.unit, price: String(category.pricePerUnit), stock: String(category.stockQuantity), threshold: String(category.lowStockThreshold ?? '') }); };
  const save = () => { const data = { name: form.name, unit: form.unit as 'kilo' | 'box' | 'piece', pricePerUnit: Number(form.price), stockQuantity: Number(form.stock), lowStockThreshold: Number(form.threshold) }; if (editing === 'new') createCategory.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); setEditing(null); } }); else if (editing) updateCategory.mutate({ categoryId: editing.id, data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); setEditing(null); } }); };
  const remove = (category: Category) => { if (window.confirm(`Remove ${category.name} from the shelf?`)) deleteCategory.mutate({ categoryId: category.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }) }); };
  const categories = categoriesQuery.data || [];
  return <div className="mx-auto max-w-[1200px]"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">Stock room</p><h1 className="mt-2 font-display text-4xl">Categories & stock</h1><p className="mt-2 text-sm text-muted-foreground">Keep the shelf honest so guests can order with confidence.</p></div><button data-testid="button-add-category" onClick={() => openForm('new')} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Plus size={16} /> Add category</button></div>{categoriesQuery.isLoading ? <PageLoader label="Checking the shelf" /> : categoriesQuery.isError ? <QueryError retry={() => categoriesQuery.refetch()} /> : categories.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center"><Package className="mx-auto text-muted-foreground" size={26} /><p className="mt-3 font-display text-2xl">The shelf is empty.</p><p className="mt-1 text-sm text-muted-foreground">Add your first sweet category to open ordering.</p></div> : <div className="mt-8 grid gap-4 md:grid-cols-2">{categories.map((category) => { const low = category.stockQuantity <= (category.lowStockThreshold || 0); return <div key={category.id} data-testid={`card-inventory-${category.id}`} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{category.name}</h2>{category.isActive === false && <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">Hidden</span>}</div><p className="mt-1 text-xs text-muted-foreground">{money.format(category.pricePerUnit)} / {unitLabels[category.unit]}</p></div><div className={`rounded-xl p-2 ${low ? 'bg-[hsl(3_58%_48%/0.12)] text-[hsl(3_58%_42%)]' : 'bg-[hsl(153_28%_48%/0.12)] text-[hsl(153_38%_30%)]'}`}><Package size={18} /></div></div><div className="mt-7 flex items-end justify-between"><div><p className="font-display text-4xl">{category.stockQuantity}</p><p className={`mt-1 text-xs font-bold ${low ? 'text-[hsl(3_58%_42%)]' : 'text-muted-foreground'}`}>{low ? 'Low stock' : `Target: ${category.lowStockThreshold || 0}`}</p></div><div className="flex gap-2"><button data-testid={`button-edit-category-${category.id}`} onClick={() => openForm(category)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Pencil size={13} /> Edit</button><button data-testid={`button-delete-category-${category.id}`} onClick={() => remove(category)} className="grid size-9 place-items-center rounded-lg border border-border text-[hsl(3_58%_42%)]"><Trash2 size={14} /></button></div></div></div> })}</div>}{editing && <CategoryModal editing={editing} form={form} setForm={setForm} onClose={() => setEditing(null)} onSave={save} isPending={createCategory.isPending || updateCategory.isPending} />}</div>;
}

function CategoryModal({ editing, form, setForm, onClose, onSave, isPending }: { editing: Category | 'new'; form: { name: string; unit: string; price: string; stock: string; threshold: string }; setForm: (form: { name: string; unit: string; price: string; stock: string; threshold: string }) => void; onClose: () => void; onSave: () => void; isPending: boolean }) {
  const update = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(164_31%_18%/0.35)] p-0 sm:items-center sm:p-5"><div className="w-full max-w-lg rounded-t-3xl bg-card p-6 sm:rounded-3xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Shelf editor</p><h2 className="mt-1 font-display text-3xl">{editing === 'new' ? 'Add a category' : 'Edit category'}</h2></div><button data-testid="button-close-category-modal" onClick={onClose} className="rounded-xl border border-border p-2"><X size={17} /></button></div><div className="mt-6 space-y-4"><label className="block text-sm font-bold">Category name<input data-testid="input-category-name" value={form.name} onChange={(e) => update('name', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" /></label><div className="grid grid-cols-2 gap-4"><label className="block text-sm font-bold">Unit<select data-testid="select-category-unit" value={form.unit} onChange={(e) => update('unit', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none"><option value="box">Box</option><option value="kilo">Kilo</option><option value="piece">Piece</option></select></label><label className="block text-sm font-bold">Price per unit<input data-testid="input-category-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none" /></label><label className="block text-sm font-bold">Stock quantity<input data-testid="input-category-stock" type="number" min="0" step="0.25" value={form.stock} onChange={(e) => update('stock', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none" /></label><label className="block text-sm font-bold">Low-stock alert<input data-testid="input-category-threshold" type="number" min="0" value={form.threshold} onChange={(e) => update('threshold', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none" /></label></div></div><div className="mt-7 flex justify-end gap-2"><button data-testid="button-cancel-category" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted-foreground">Cancel</button><button data-testid="button-save-category" disabled={!form.name || !form.price || !form.stock || isPending} onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{isPending && <Loader2 size={15} className="animate-spin" />} Save category</button></div></div></div>;
}

function AnalyticsPage() {
  const summaryQuery = useGetDashboardSummary();
  const analyticsQuery = useGetDashboardAnalytics({ query: { queryKey: getGetDashboardAnalyticsQueryKey() } });
  const analytics = analyticsQuery.data as DashboardAnalytics | undefined;
  const maxDaily = Math.max(...(analytics?.dailyOrders || []).map((item) => item.orders), 1);
  return <div className="mx-auto max-w-[1400px]"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">Signals & rhythm</p><h1 className="mt-2 font-display text-4xl">Eid at a glance</h1><p className="mt-2 text-sm text-muted-foreground">A little perspective for the busiest days of the year.</p></div>{summaryQuery.isLoading || analyticsQuery.isLoading ? <PageLoader label="Gathering the season" /> : summaryQuery.isError || analyticsQuery.isError ? <QueryError retry={() => { summaryQuery.refetch(); analyticsQuery.refetch(); }} /> : <><div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><section className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Orders over the last 7 days</p><h2 className="mt-1 font-display text-2xl">The counter is warming up</h2></div><BarChart3 className="text-[hsl(9_54%_63%)]" size={23} /></div><div className="mt-8 flex h-56 items-end gap-2 border-b border-l border-border px-3 pb-0 sm:gap-4">{(analytics?.dailyOrders || []).map((point) => <div key={point.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="relative w-full max-w-12 rounded-t-lg bg-[hsl(38_74%_63%)] transition-all group-hover:bg-[hsl(9_54%_63%)]" style={{ height: `${Math.max((point.orders / maxDaily) * 85, 7)}%` }}><span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono-ui text-[10px] opacity-0 transition-opacity group-hover:opacity-100">{point.orders}</span></div><span className="font-mono-ui text-[9px] text-muted-foreground">{point.date.slice(5)}</span></div>)}</div></section><section className="rounded-2xl bg-[hsl(164_31%_18%)] p-6 text-[hsl(39_45%_94%)]"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">Countdown</p><div className="mt-7 flex items-baseline gap-3"><span className="font-display text-7xl text-[hsl(38_74%_63%)]">{summaryQuery.data?.daysUntilEid ?? '—'}</span><span className="text-sm text-[hsl(39_18%_69%)]">days left</span></div><p className="mt-5 text-sm leading-6 text-[hsl(39_18%_69%)]">Every box is a small part of someone’s celebration. Keep the handoff warm and the labels clear.</p><div className="mt-7 flex items-center gap-2 text-xs font-bold text-[hsl(38_74%_63%)]"><Sparkles size={14} /> Season mode is on</div></section></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Best-loved sweets</p><h2 className="mt-1 font-display text-2xl">Category performance</h2><div className="mt-6 space-y-5">{(analytics?.categoryTotals || []).map((item, index) => { const max = Math.max(...(analytics?.categoryTotals || []).map((entry) => entry.revenue), 1); return <div key={item.categoryName}><div className="flex justify-between text-sm"><span className="font-semibold">{item.categoryName}</span><span className="font-mono-ui text-xs text-muted-foreground">{money.format(item.revenue)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${index % 2 ? 'bg-[hsl(9_54%_63%)]' : 'bg-[hsl(38_74%_63%)]'}`} style={{ width: `${(item.revenue / max) * 100}%` }} /></div><p className="mt-1 text-[10px] text-muted-foreground">{item.quantity} units sold</p></div> })}</div></section><section className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Order mix</p><h2 className="mt-1 font-display text-2xl">Where things stand</h2><div className="mt-6 grid gap-3 sm:grid-cols-2">{(analytics?.statusTotals || []).map((item) => <div key={item.status} className="flex items-center justify-between rounded-xl bg-muted p-4"><div className="flex items-center gap-3"><span className={`size-2.5 rounded-full ${item.status === 'ready' ? 'bg-[hsl(153_28%_48%)]' : item.status === 'pending' ? 'bg-[hsl(38_74%_63%)]' : 'bg-[hsl(9_54%_63%)]'}`} /><span className="text-sm font-semibold">{statusLabels[item.status]}</span></div><span className="font-display text-2xl">{item.count}</span></div>)}</div></section></div></>}</div>;
}

function SignInPage() {
  return <div className="surface-grid flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="surface-grid flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function AdminGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <PageLoader label="Checking your counter access" />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
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

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={HomePage} /><Route path="/track" component={TrackPage} /><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route path="/admin/login"><Redirect to="/sign-in" /></Route><Route path="/admin"><AdminGuard><AdminShell><AdminOverview /></AdminShell></AdminGuard></Route><Route path="/admin/orders"><AdminGuard><AdminShell><OrdersPage /></AdminShell></AdminGuard></Route><Route path="/admin/categories"><AdminGuard><AdminShell><CategoriesPage /></AdminShell></AdminGuard></Route><Route path="/admin/analytics"><AdminGuard><AdminShell><AnalyticsPage /></AdminShell></AdminGuard></Route><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to open the counter' } }, signUp: { start: { title: 'Join the counter team', subtitle: 'Create your shop access' } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}><QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><Router /></QueryClientProvider></ClerkProvider>;
}

function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter><Toaster /></TooltipProvider>;
}

export default App;