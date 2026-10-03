import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { playOrderChime } from '@/lib/audio';
import { getWhatsAppLink } from '@/lib/whatsapp';
import { PrintableReceipt } from '@/components/receipt/PrintableReceipt';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChefHat,
  ClipboardList,
  Clock3,
  Crown,
  DollarSign,
  Download,
  ExternalLink,
  Filter,
  KeyRound,
  Loader2,
  Menu,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
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
} from 'lucide-react';
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
  type DashboardAnalytics,
  type DashboardSummary,
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
type Language = 'ar' | 'en';
type CopyKey = keyof typeof copy.en;

const copy = {
  en: {
    language: 'العربية',
    trackOrder: 'Track an order',
    staffSignIn: 'Staff sign in',
    eidTable: 'Made for your Eid table',
    heroTitle: 'Sweet things,',
    heroAccent: 'kept simple.',
    heroDescription: 'Small-batch mithai, packed with care in our neighborhood kitchen. Choose a pickup slot and we will have your box ready when the family arrives.',
    sameDayPickup: 'Same-day pickup',
    noOnlinePayment: 'No payment online',
    thisWeek: 'This week at the counter',
    testimonial: '“The box arrived before the aunties did.”',
    testimonialBy: '— Mariam, Northbridge',
    sweetShelf: 'The sweet shelf',
    buildBox: 'Build your box',
    selections: 'selections',
    yourBox: 'Your box',
    nothingYet: 'Nothing tucked in yet',
    addSweet: 'Add a sweet from the shelf to start your Eid box.',
    soldOut: 'Sold out',
    left: 'left',
    addToBox: 'Add to box',
    estimatedTotal: 'Estimated total',
    pickupDetails: 'Choose pickup details',
    backToSweets: 'Back to sweets',
    almostThere: 'Almost there',
    meetYou: 'Tell us where to meet you.',
    holdOrder: 'We will hold your order at the counter under your name.',
    yourName: 'Your name',
    mobileNumber: 'Mobile number',
    pickupDate: 'Pickup date',
    pickupTime: 'Pickup time',
    todayLabel: 'Today',
    tomorrowLabel: 'Tomorrow',
    thisWeekLabel: 'This week',
    customDateLabel: 'Custom date',
    pickupTimeSlot: 'Pickup time slot',
    allSlots: 'All times',
    morningSlot: 'Morning (10 - 12)',
    afternoonSlot: 'Afternoon (1 - 4)',
    eveningSlot: 'Evening (5 - 10)',
    customTimeOption: 'Or choose exact time',
    selectedPickupNotice: 'Your order will be ready for pickup on',
    kitchenNote: 'A note for the kitchen',
    optional: '(optional)',
    namePlaceholder: 'e.g. Amina Rahman',
    phonePlaceholder: 'For pickup updates',
    notePlaceholder: 'Allergies, a family name for the box, or a kind word...',
    orderTotal: 'Order total',
    paymentInPerson: 'Payment happens in person at pickup. We will confirm your slot by phone if anything needs adjusting.',
    sendingRequest: 'Sending request...',
    placeRequest: 'Place pickup request',
    saveError: 'We could not save that request. Please try again.',
    requestReceived: 'Request received',
    sweetsOnList: 'Your sweets are on the list.',
    requestSent: 'We have sent the pickup request to our counter team. Keep your order number handy — we will use it to find your box.',
    printReceipt: 'Print pickup receipt',
    orderAnother: 'Order another box',
    pickupStarts: 'A calm pickup starts here',
    findOrder: 'Find your order.',
    trackHelp: 'Use the order number from your confirmation, or the mobile number you left with us.',
    orderNumber: 'Order number',
    mobile: 'Mobile number',
    find: 'Find',
    noOrder: 'No order found',
    checkDetails: 'Check the details and try once more, or call the shop if you are already at the counter.',
    pickup: 'Pickup',
    forCustomer: 'For',
    total: 'Total',
    workspace: 'Workspace',
    overview: 'Overview',
    orders: 'Orders',
    categoriesStock: 'Categories & stock',
    analytics: 'Analytics',
    team: 'Team',
    teamDescription: 'Give each worker only the access they need.',
    manageTeam: 'Manage team',
    owner: 'Shop owner',
    staff: 'Staff member',
    noAccess: 'No access',
    ordersPermission: 'Orders',
    inventoryPermission: 'Inventory',
    analyticsPermission: 'Analytics',
    teamPermission: 'Team management',
    savePermissions: 'Save permissions',
    permissionsSaved: 'Permissions saved',
    accountAccess: 'Account access',
    enableStaff: 'Allow access',
    disableStaff: 'Disable access',
    createAccountHint: 'Ask the worker to create an account first. New accounts will appear here so you can grant access.',
    ownerSetupTitle: 'Set up the shop owner account',
    ownerSetupDescription: 'This is a one-time step. Your signed-in account will become the main owner account and will control staff permissions.',
    activateOwner: 'Activate owner account',
    ownerSetupError: 'The owner account could not be activated. Refresh and try again.',
    permissionDenied: 'You do not have this permission',
    permissionDeniedDescription: 'Ask the shop owner to enable this section for your account.',
    live: 'live',
    pickupDesk: 'Pickup desk mode',
    ordersTidy: 'Orders stay tidy from first request to family collection.',
    viewShop: 'View shop',
    goodMorning: 'Good morning, counter team.',
    calmerEid: 'A clear queue makes a calmer Eid.',
    publicTracker: 'Public tracker',
    signOut: 'Sign out',
    checkingAccess: 'Checking your counter access',
    loading: 'Loading',
    cannotReach: 'We could not reach the counter.',
    connection: 'Check your connection and try again.',
    retry: 'Try again',
    staffOnly: 'Staff access only',
    teamOnly: 'This counter is for the shop team.',
    noStaffAccess: 'Your signed-in Clerk account does not have staff access. Ask the shop owner to grant access in Clerk, then try again.',
    counterOverview: 'Counter overview',
    overviewDescription: 'The small details that keep a big family day moving.',
    openQueue: 'Open order queue',
    needsReply: 'Needs a reply',
    newPickupRequests: 'New pickup requests',
    todaysPickups: 'Today’s pickups',
    allTimeSlots: 'Across all time slots',
    acceptedRevenue: 'Accepted revenue',
    confirmedOrders: 'Confirmed orders',
    lowStockItems: 'Low stock items',
    worthChecking: 'Worth checking today',
    pickupQueue: 'Pickup queue',
    todayCounter: 'Today at the counter',
    viewAll: 'View all',
    eidReadiness: 'Eid readiness',
    keepJoy: 'Keep the joy moving.',
    daysUntilEid: 'days until Eid',
    topSeller: 'Top seller',
    notEnoughData: 'Not enough data yet',
    seePicture: 'See the full picture',
    queueClear: 'The queue is clear.',
    newRequestsHere: 'New pickup requests will land here.',
    operations: 'Operations',
    orderQueue: 'Order queue',
    queueDescription: 'A single view of every box moving through the kitchen.',
    exportWeek: 'Export this week',
    searchOrders: 'Search name, order number or phone',
    allOrders: 'All orders',
    loadingOrders: 'Loading orders',
    noOrdersView: 'No orders match that view.',
    clearSearch: 'Try clearing the search or choosing another status.',
    customer: 'Customer',
    placed: 'Placed',
    status: 'Status',
    orderDetail: 'Order detail',
    accept: 'Accept order',
    startPreparing: 'Start preparing',
    markReady: 'Mark ready',
    markCollected: 'Mark collected',
    decline: 'Decline',
    printReceiptEnglish: 'Print receipt',
    stockRoom: 'Stock room',
    categories: 'Categories & stock',
    stockDescription: 'Keep the shelf honest so guests can order with confidence.',
    addCategory: 'Add category',
    checkingShelf: 'Checking the shelf',
    shelfEmpty: 'The shelf is empty.',
    addFirstSweet: 'Add your first sweet category to open ordering.',
    hidden: 'Hidden',
    lowStock: 'Low stock',
    target: 'Target',
    edit: 'Edit',
    shelfEditor: 'Shelf editor',
    addCategoryTitle: 'Add a category',
    editCategory: 'Edit category',
    categoryName: 'Category name',
    unit: 'Unit',
    box: 'Box',
    kilo: 'Kilo',
    piece: 'Piece',
    pricePerUnit: 'Price per unit',
    stockQuantity: 'Stock quantity',
    lowStockAlert: 'Low-stock alert',
    categoryImage: 'Category photo',
    imageUrlPlaceholder: 'Image URL (e.g. https://...)',
    selectPresetImage: 'Or select a sweet photo:',
    changePhoto: 'Change photo',
    changeCategoryPictureTitle: 'Change sweet photo',
    uploadFromDevice: 'Upload photo from device',
    uploadingPhoto: 'Processing photo...',
    savePhoto: 'Save photo',
    customUrl: 'Image URL',
    cancel: 'Cancel',
    saveCategory: 'Save category',
    signals: 'Signals & rhythm',
    eidAtGlance: 'Eid at a glance',
    analyticsDescription: 'A little perspective for the busiest days of the year.',
    gatheringSeason: 'Gathering the season',
    ordersSevenDays: 'Orders over the last 7 days',
    warmingUp: 'The counter is warming up',
    countdown: 'Countdown',
    daysLeft: 'days left',
    celebration: 'Every box is a small part of someone’s celebration. Keep the handoff warm and the labels clear.',
    seasonOn: 'Season mode is on',
    bestLoved: 'Best-loved sweets',
    performance: 'Category performance',
    unitsSold: 'units sold',
    orderMix: 'Order mix',
    whereStand: 'Where things stand',
    welcomeBack: 'Welcome back',
    signInSubtitle: 'Sign in to open the counter',
    joinTeam: 'Join the counter team',
    createAccess: 'Create your shop access',
    requestReceivedReceipt: 'Pickup receipt',
    receiptDate: 'Date',
    receiptCustomer: 'Customer',
    receiptPhone: 'Mobile',
    receiptTime: 'Pickup time',
    item: 'Item',
    quantity: 'Quantity',
    paymentAtPickup: 'Payment at pickup — thank you for choosing Fatouh Sweets',
  },
  ar: {
    language: 'English',
    trackOrder: 'تتبع طلبك',
    staffSignIn: 'دخول الموظفين',
    eidTable: 'جاهزة لسفرة العيد',
    heroTitle: 'حلويات طازة،',
    heroAccent: 'بطعم البيت.',
    heroDescription: 'حلويات شرقية طازة ومتجهزة بعناية. اختار ميعاد الاستلام وهنجهز طلبك قبل ما العيلة توصل.',
    sameDayPickup: 'استلام في نفس اليوم',
    noOnlinePayment: 'الدفع عند الاستلام',
    thisWeek: 'طلبات الأسبوع',
    testimonial: '«العلبة وصلت قبل الخالات.»',
    testimonialBy: '— مريم، نورث بريدج',
    sweetShelf: 'رف الحلويات',
    buildBox: 'كوّن علبتك',
    selections: 'اختيارات',
    yourBox: 'علبتك',
    nothingYet: 'لسه مفيش حاجة في العلبة',
    addSweet: 'اختار حلو من الرف وابدأ علبة العيد.',
    soldOut: 'نفدت الكمية',
    left: 'متبقي',
    addToBox: 'أضف للعلبة',
    estimatedTotal: 'الإجمالي المتوقع',
    pickupDetails: 'اختار تفاصيل الاستلام',
    backToSweets: 'العودة للحلويات',
    almostThere: 'فاضل خطوة',
    meetYou: 'قول لنا نستلمك الطلب إمتى.',
    holdOrder: 'هنجهز طلبك على اسمك في المحل.',
    yourName: 'الاسم',
    mobileNumber: 'رقم الموبايل',
    pickupDate: 'تاريخ الاستلام',
    pickupTime: 'ميعاد الاستلام',
    todayLabel: 'اليوم',
    tomorrowLabel: 'غداً',
    thisWeekLabel: 'خلال هذا الأسبوع',
    customDateLabel: 'تاريخ مخصص',
    pickupTimeSlot: 'وقت الاستلام',
    allSlots: 'جميع الأوقات',
    morningSlot: 'صباحاً (10 - 12)',
    afternoonSlot: 'عصراً (1 - 4)',
    eveningSlot: 'مساءً (5 - 10)',
    customTimeOption: 'أو حدد وقتاً محدداً',
    selectedPickupNotice: 'سيتم تجهيز طلبك للاستلام في',
    kitchenNote: 'ملاحظة للمطبخ',
    optional: '(اختياري)',
    namePlaceholder: 'مثال: أمينة أحمد',
    phonePlaceholder: 'لتأكيد ميعاد الاستلام',
    notePlaceholder: 'حساسية، اسم العيلة على العلبة، أو أي ملاحظة...',
    orderTotal: 'إجمالي الطلب',
    paymentInPerson: 'الدفع عند الاستلام. هنتواصل معاك على الموبايل لو في أي تعديل على الميعاد.',
    sendingRequest: 'جاري إرسال الطلب...',
    placeRequest: 'تأكيد طلب الاستلام',
    saveError: 'لم نتمكن من حفظ الطلب. حاول مرة أخرى.',
    requestReceived: 'تم استلام الطلب',
    sweetsOnList: 'حلوياتك اتسجلت عندنا.',
    requestSent: 'طلبك وصل لفريق المحل. احتفظ برقم الطلب عشان نقدر نجهز علبتك.',
    printReceipt: 'طباعة إيصال الاستلام',
    orderAnother: 'اطلب علبة تانية',
    pickupStarts: 'استلام هادي يبدأ من هنا',
    findOrder: 'دور على طلبك.',
    trackHelp: 'استخدم رقم الطلب من التأكيد، أو رقم الموبايل المسجل.',
    orderNumber: 'رقم الطلب',
    mobile: 'رقم الموبايل',
    find: 'بحث',
    noOrder: 'لم يتم العثور على طلب',
    checkDetails: 'راجع البيانات وحاول مرة أخرى، أو اتصل بالمحل لو أنت عندنا بالفعل.',
    pickup: 'الاستلام',
    forCustomer: 'للعميل',
    total: 'الإجمالي',
    workspace: 'مساحة العمل',
    overview: 'نظرة عامة',
    orders: 'الطلبات',
    categoriesStock: 'الأصناف والمخزون',
    analytics: 'التحليلات',
    team: 'فريق المحل',
    teamDescription: 'ادي كل عامل الصلاحيات اللي محتاجها بس.',
    manageTeam: 'إدارة الفريق',
    owner: 'مالك المحل',
    staff: 'موظف',
    noAccess: 'بدون صلاحية',
    ordersPermission: 'الطلبات',
    inventoryPermission: 'المخزون',
    analyticsPermission: 'التحليلات',
    teamPermission: 'إدارة الفريق',
    savePermissions: 'حفظ الصلاحيات',
    permissionsSaved: 'تم حفظ الصلاحيات',
    accountAccess: 'صلاحية الحساب',
    enableStaff: 'السماح بالدخول',
    disableStaff: 'إيقاف الدخول',
    createAccountHint: 'خلي العامل يعمل حساب الأول. الحسابات الجديدة هتظهر هنا عشان تديها الصلاحيات.',
    ownerSetupTitle: 'تفعيل حساب مالك المحل',
    ownerSetupDescription: 'دي خطوة مرة واحدة. الحساب اللي داخل دلوقتي هيبقى حساب المالك الرئيسي، ومنه هتتحكم في صلاحيات الفريق.',
    activateOwner: 'تفعيل حساب المالك',
    ownerSetupError: 'لم نتمكن من تفعيل حساب المالك. حدّث الصفحة وحاول مرة أخرى.',
    permissionDenied: 'الصلاحية دي مش متاحة لحسابك',
    permissionDeniedDescription: 'اطلب من مالك المحل تفعيل القسم ده لحسابك.',
    live: 'مباشر',
    pickupDesk: 'وضع مكتب الاستلام',
    ordersTidy: 'كل الطلبات مرتبة من أول الطلب لحد الاستلام.',
    viewShop: 'عرض المحل',
    goodMorning: 'صباح الخير يا فريق المحل.',
    calmerEid: 'قائمة مرتبة تخلي يوم العيد أسهل.',
    publicTracker: 'تتبع العملاء',
    signOut: 'تسجيل الخروج',
    checkingAccess: 'جاري التحقق من صلاحية الدخول',
    loading: 'جاري التحميل',
    cannotReach: 'لم نتمكن من الوصول للمحل.',
    connection: 'راجع الاتصال وحاول مرة أخرى.',
    retry: 'حاول مرة أخرى',
    staffOnly: 'للموظفين فقط',
    teamOnly: 'الصفحة دي لفريق المحل.',
    noStaffAccess: 'حسابك المسجل مش عنده صلاحية الموظفين. اطلب من صاحب المحل تفعيل صلاحيتك ثم حاول مرة أخرى.',
    counterOverview: 'نظرة عامة على المحل',
    overviewDescription: 'تفاصيل صغيرة تساعد يوم العيد يمشي بسلاسة.',
    openQueue: 'فتح قائمة الطلبات',
    needsReply: 'تحتاج رد',
    newPickupRequests: 'طلبات استلام جديدة',
    todaysPickups: 'استلامات اليوم',
    allTimeSlots: 'كل المواعيد',
    acceptedRevenue: 'إيراد الطلبات المقبولة',
    confirmedOrders: 'الطلبات المؤكدة',
    lowStockItems: 'أصناف قليلة',
    worthChecking: 'تحتاج مراجعة اليوم',
    pickupQueue: 'قائمة الاستلام',
    todayCounter: 'طلبات اليوم',
    viewAll: 'عرض الكل',
    eidReadiness: 'جاهزية العيد',
    keepJoy: 'خلّي الفرحة مستمرة.',
    daysUntilEid: 'يوم حتى العيد',
    topSeller: 'الأكثر مبيعًا',
    notEnoughData: 'لا توجد بيانات كافية',
    seePicture: 'عرض التفاصيل',
    queueClear: 'القائمة فاضية.',
    newRequestsHere: 'طلبات الاستلام الجديدة هتظهر هنا.',
    operations: 'التشغيل',
    orderQueue: 'قائمة الطلبات',
    queueDescription: 'عرض واحد لكل العلب التي تتحرك داخل المطبخ.',
    exportWeek: 'تصدير هذا الأسبوع',
    searchOrders: 'ابحث بالاسم أو رقم الطلب أو الموبايل',
    allOrders: 'كل الطلبات',
    loadingOrders: 'جاري تحميل الطلبات',
    noOrdersView: 'لا توجد طلبات في العرض الحالي.',
    clearSearch: 'امسح البحث أو اختار حالة أخرى.',
    customer: 'العميل',
    placed: 'تاريخ الطلب',
    status: 'الحالة',
    orderDetail: 'تفاصيل الطلب',
    accept: 'قبول الطلب',
    startPreparing: 'بدء التجهيز',
    markReady: 'جاهز للاستلام',
    markCollected: 'تم الاستلام',
    decline: 'رفض',
    printReceiptEnglish: 'طباعة الإيصال',
    stockRoom: 'المخزون',
    categories: 'الأصناف والمخزون',
    stockDescription: 'خلي المخزون واضح عشان العملاء يطلبوا بثقة.',
    addCategory: 'إضافة صنف',
    checkingShelf: 'جاري فحص الرف',
    shelfEmpty: 'الرف فاضي.',
    addFirstSweet: 'أضف أول صنف حلويات لفتح الطلبات.',
    hidden: 'مخفي',
    lowStock: 'مخزون قليل',
    target: 'المستهدف',
    edit: 'تعديل',
    shelfEditor: 'تعديل الصنف',
    addCategoryTitle: 'إضافة صنف',
    editCategory: 'تعديل الصنف',
    categoryName: 'اسم الصنف',
    unit: 'الوحدة',
    box: 'علبة',
    kilo: 'كيلو',
    piece: 'قطعة',
    pricePerUnit: 'السعر لكل وحدة',
    stockQuantity: 'الكمية المتاحة',
    lowStockAlert: 'تنبيه المخزون القليل',
    categoryImage: 'صورة الصنف',
    imageUrlPlaceholder: 'رابط الصورة (مثلاً https://...)',
    selectPresetImage: 'أو اختر صورة جاهزة:',
    changePhoto: 'تغيير الصورة',
    changeCategoryPictureTitle: 'تغيير صورة الصنف',
    uploadFromDevice: 'رفع صورة من جهازك',
    uploadingPhoto: 'جاري تجهيز الصورة...',
    savePhoto: 'حفظ الصورة',
    customUrl: 'رابط الصورة',
    cancel: 'إلغاء',
    saveCategory: 'حفظ الصنف',
    signals: 'مؤشرات الموسم',
    eidAtGlance: 'العيد في لمحة',
    analyticsDescription: 'نظرة سريعة على أكثر أيام السنة ازدحامًا.',
    gatheringSeason: 'جاري تجهيز بيانات الموسم',
    ordersSevenDays: 'طلبات آخر 7 أيام',
    warmingUp: 'الحركة بتزيد في المحل',
    countdown: 'العد التنازلي',
    daysLeft: 'يوم متبقي',
    celebration: 'كل علبة جزء صغير من فرحة حد. خلّي التسليم دافي والبيانات واضحة.',
    seasonOn: 'وضع الموسم يعمل',
    bestLoved: 'الحلويات المفضلة',
    performance: 'أداء الأصناف',
    unitsSold: 'وحدة مباعة',
    orderMix: 'توزيع الطلبات',
    whereStand: 'الوضع الحالي',
    welcomeBack: 'أهلًا بعودتك',
    signInSubtitle: 'سجّل الدخول لفتح المحل',
    joinTeam: 'انضم لفريق المحل',
    createAccess: 'أنشئ صلاحية المحل',
    requestReceivedReceipt: 'إيصال استلام',
    receiptDate: 'التاريخ',
    receiptCustomer: 'العميل',
    receiptPhone: 'الموبايل',
    receiptTime: 'ميعاد الاستلام',
    item: 'الصنف',
    quantity: 'الكمية',
    paymentAtPickup: 'الدفع عند الاستلام — شكرًا لاختياركم حلويات فتوح',
  },
} as const;

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
const unitLabels: Record<string, string> = { kilo: 'kg', box: 'box', piece: 'piece' };
const unitLabelsAr: Record<string, string> = { kilo: 'كجم', box: 'علبة', piece: 'قطعة' };
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

function AdminShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { signOut } = useUnifiedAuth();
  const { t, language } = useLanguage();
  const access = useStaffAccess();
  const isOwner = access.role === 'owner';
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('order_sound_enabled') !== 'false');
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('order_sound_enabled', String(next));
    if (next) playOrderChime();
  };

  const links = [
    { href: '/admin', label: t('overview'), icon: BarChart3, permission: 'analytics' as StaffPermission },
    { href: '/admin/orders', label: t('orders'), icon: ClipboardList, permission: 'orders' as StaffPermission },
    { href: '/admin/kitchen', label: language === 'ar' ? 'تشغيل المعمل' : 'Kitchen Sheet', icon: ChefHat, permission: 'orders' as StaffPermission },
    { href: '/admin/categories', label: t('categoriesStock'), icon: Package, permission: 'inventory' as StaffPermission },
    { href: '/admin/analytics', label: t('analytics'), icon: TrendingUp, permission: 'analytics' as StaffPermission },
    { href: '/admin/team', label: t('team'), icon: Users, permission: 'team' as StaffPermission },
  ].filter((link) => hasPermission(access, link.permission));
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

function getCairoDateInfo(offsetDays = 0) {
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

    return { iso, dayNameAr, dayNameEn, formattedAr, formattedEn };
  } catch {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const iso = d.toISOString().slice(0, 10);
    return { iso, dayNameAr: '', dayNameEn: '', formattedAr: iso, formattedEn: iso };
  }
}

function formatPickupTimeSlot(time: string, lang: 'ar' | 'en'): string {
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
  const [cart, setCart] = useState<Record<number, number>>({});
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
  const cartLines = activeCategories.filter((category) => cart[category.id]);
  const total = cartLines.reduce((sum, category) => sum + (cart[category.id] || 0) * category.pricePerUnit, 0);
  const orderPayload = { customerName: customer.name, phoneNumber: customer.phone, pickupDate: customer.date, pickupTime: customer.time, notes: customer.notes || undefined, createdBy: 'guest' as const, items: cartLines.map((category) => ({ categoryId: category.id, quantity: cart[category.id] })) };
  const add = (id: number, amount: number) => setCart((current) => ({ ...current, [id]: Math.max(0, (current[id] || 0) + amount) }));
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
              <div className="relative isolate overflow-hidden rounded-[24px] sm:rounded-[28px] bg-[hsl(164_31%_18%)] p-6 sm:p-7 text-[hsl(39_45%_94%)] warm-shadow md:min-h-[280px]">
                <div className="absolute -right-12 -top-16 size-48 rounded-full border-[22px] border-[hsl(38_74%_63%/0.25)] pointer-events-none" />
                <div className="absolute -bottom-24 -left-8 size-48 rounded-full border-[30px] border-[hsl(9_54%_63%/0.18)] pointer-events-none" />
                <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-[hsl(38_74%_63%)]">{t('thisWeek')}</p>
                <p className="relative mt-8 sm:mt-12 max-w-xs font-display text-2xl sm:text-3xl leading-snug sm:leading-tight">{t('testimonial')}</p>
                <p className="relative mt-4 sm:mt-5 text-xs sm:text-sm text-[hsl(39_18%_69%)]">{t('testimonialBy')}</p>
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
                            <div className="absolute bottom-3 start-3 end-3 flex items-end justify-between text-white">
                              <div className="min-w-0 pr-2">
                                <h3 className="font-display text-base sm:text-lg font-bold tracking-tight drop-shadow truncate">{category.name}</h3>
                                <p className="text-xs font-medium text-white/90 drop-shadow">
                                  {money.format(category.pricePerUnit)} / {getUnitLabel(category.unit, language)}
                                </p>
                              </div>
                              <div className="grid size-8 place-items-center rounded-lg bg-black/30 backdrop-blur-sm text-white shrink-0">
                                <ShoppingBag size={15} />
                              </div>
                            </div>
                          </div>
                          <div className="p-3.5 sm:p-4 flex flex-col justify-between flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className={`text-xs ${category.stockQuantity <= (category.lowStockThreshold || 0) ? 'font-bold text-[hsl(3_58%_48%)]' : 'text-muted-foreground'}`}>
                                {category.stockQuantity > 0 ? `${category.stockQuantity} ${getUnitLabel(category.unit, language)} ${t('left')}` : t('soldOut')}
                              </span>
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                {cart[category.id] ? (
                                  <>
                                    <button
                                      data-testid={`button-decrease-${category.id}`}
                                      onClick={() => add(category.id, -1)}
                                      className="grid size-7 sm:size-8 place-items-center rounded-lg border border-border font-bold hover:bg-muted transition-colors text-sm"
                                    >
                                      −
                                    </button>
                                    <span data-testid={`text-quantity-${category.id}`} className="w-5 text-center text-xs sm:text-sm font-bold">
                                      {cart[category.id]}
                                    </span>
                                  </>
                                ) : null}
                                <button
                                  data-testid={`button-add-${category.id}`}
                                  disabled={category.stockQuantity <= 0 || (cart[category.id] || 0) >= category.stockQuantity}
                                  onClick={() => add(category.id, 1)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {cart[category.id] ? <Plus size={14} /> : t('addToBox')}
                                </button>
                              </div>
                            </div>
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
                      {cartLines.map((category) => (
                        <div key={category.id} className="flex items-center justify-between text-xs sm:text-sm gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={category.imageUrl || getCategoryFallbackImage(category.name)}
                              alt=""
                              className="size-7 sm:size-8 rounded-lg object-cover border border-border shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = getCategoryFallbackImage(category.name);
                              }}
                            />
                            <span className="truncate">{cart[category.id]} × {category.name}</span>
                          </div>
                          <span className="font-mono-ui text-xs shrink-0">{money.format(cart[category.id] * category.pricePerUnit)}</span>
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
        {step === 'details' && <OrderDetails customer={customer} setCustomer={setCustomer} total={total} onBack={() => setStep('shop')} onSubmit={submit} isPending={createOrder.isPending} error={createOrder.isError} />}
        {step === 'success' && completedOrder && <OrderSuccess order={completedOrder} onReset={resetOrder} />}
      </main>
    </div>
  );
}

function OrderDetails({
  customer,
  setCustomer,
  total,
  onBack,
  onSubmit,
  isPending,
  error,
}: {
  customer: { name: string; phone: string; date: string; time: string; notes: string };
  setCustomer: (value: { name: string; phone: string; date: string; time: string; notes: string }) => void;
  total: number;
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
  error: boolean;
}) {
  const { t, language } = useLanguage();
  const update = (key: keyof typeof customer, value: string) => setCustomer({ ...customer, [key]: value });

  const todayInfo = useMemo(() => getCairoDateInfo(0), []);
  const tomorrowInfo = useMemo(() => getCairoDateInfo(1), []);
  const weekDays = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => getCairoDateInfo(i)), []);

  useEffect(() => {
    if (!customer.date) {
      update('date', todayInfo.iso);
    }
  }, [customer.date, todayInfo.iso]);

  const [dateCategory, setDateCategory] = useState<'today' | 'tomorrow' | 'thisWeek' | 'custom'>(() => {
    if (!customer.date || customer.date === todayInfo.iso) return 'today';
    if (customer.date === tomorrowInfo.iso) return 'tomorrow';
    if (weekDays.some((w) => w.iso === customer.date)) return 'thisWeek';
    return 'custom';
  });

  const [timePeriod, setTimePeriod] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');

  const filteredSlots = useMemo(() => {
    if (timePeriod === 'all') return PICKUP_TIME_SLOTS;
    return PICKUP_TIME_SLOTS.filter((s) => s.period === timePeriod);
  }, [timePeriod]);

  const selectDatePreset = (category: 'today' | 'tomorrow' | 'thisWeek' | 'custom') => {
    setDateCategory(category);
    if (category === 'today') {
      update('date', todayInfo.iso);
    } else if (category === 'tomorrow') {
      update('date', tomorrowInfo.iso);
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
            <div className="space-y-3 rounded-2xl border border-border/80 bg-card/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-bold flex items-center gap-2">
                  <CalendarDays size={17} className="text-[hsl(9_54%_63%)]" />
                  <span>{t('pickupDate')}</span>
                </label>
                {customer.date && (
                  <span className="rounded-full bg-[hsl(38_74%_63%/0.15)] px-2.5 py-1 text-xs font-semibold text-[hsl(34_65%_35%)] dark:text-[hsl(38_74%_63%)]">
                    {customer.date === todayInfo.iso
                      ? `${t('todayLabel')} · ${language === 'ar' ? todayInfo.formattedAr : todayInfo.formattedEn}`
                      : customer.date === tomorrowInfo.iso
                      ? `${t('tomorrowLabel')} · ${language === 'ar' ? tomorrowInfo.formattedAr : tomorrowInfo.formattedEn}`
                      : `${language === 'ar' ? selectedDateInfo.dayNameAr : selectedDateInfo.dayNameEn} · ${
                          language === 'ar' ? selectedDateInfo.formattedAr : selectedDateInfo.formattedEn
                        }`}
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
                    7 {language === 'ar' ? 'أيام' : 'days'}
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
                    {customer.date === todayInfo.iso
                      ? `${t('todayLabel')} (${language === 'ar' ? todayInfo.formattedAr : todayInfo.formattedEn})`
                      : customer.date === tomorrowInfo.iso
                      ? `${t('tomorrowLabel')} (${language === 'ar' ? tomorrowInfo.formattedAr : tomorrowInfo.formattedEn})`
                      : customer.date}{' '}
                    — {formatPickupTimeSlot(customer.time, language)}
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

        <aside className="h-fit rounded-2xl bg-[hsl(164_31%_18%)] p-5 text-[hsl(39_45%_94%)] sticky top-24">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">
            {t('orderTotal')}
          </p>
          <p className="mt-3 font-display text-4xl">{money.format(total)}</p>
          <p className="mt-3 text-xs leading-5 text-[hsl(39_18%_69%)]">{t('paymentInPerson')}</p>
          <button
            data-testid="button-place-order"
            disabled={!valid || isPending}
            onClick={onSubmit}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(38_74%_63%)] px-4 py-3 text-sm font-bold text-[hsl(164_31%_18%)] transition-transform hover:scale-[1.01] disabled:opacity-45"
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

function OrderSuccess({ order, onReset }: { order: Order; onReset: () => void }) {
  const { t } = useLanguage();
  return <section className="mx-auto max-w-xl py-20 text-center"><div className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[hsl(153_28%_48%/0.16)] text-[hsl(153_38%_30%)]"><Check size={30} /></div><p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(9_54%_63%)]">{t('requestReceived')}</p><h1 className="mt-3 font-display text-5xl">{t('sweetsOnList')}</h1><p className="mx-auto mt-4 max-w-md leading-7 text-muted-foreground">{t('requestSent')}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><button type="button" data-testid="button-print-receipt" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[hsl(9_54%_55%)] px-5 py-3 text-sm font-bold text-white"><Printer size={16} /> {t('printReceipt')}</button><Link href="/track" data-testid="link-track-success" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">{t('trackOrder')} <ArrowRight size={16} /></Link><button type="button" data-testid="link-order-another" onClick={onReset} className="rounded-xl border border-border px-5 py-3 text-sm font-bold hover:bg-muted">{t('orderAnother')}</button></div><PrintableReceipt order={order} /></section>;
}

function TrackPage() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'orderNumber' | 'phone'>('orderNumber');
  const [value, setValue] = useState('');
  const [params, setParams] = useState<{ orderNumber?: string; phone?: string }>({});
  const trackQuery = useTrackOrder(params, { query: { enabled: Boolean(params.orderNumber || params.phone), queryKey: getTrackOrderQueryKey(params) } });
  const orders = Array.isArray(trackQuery.data) ? trackQuery.data : [];
  return <div className="min-h-[100dvh] bg-background surface-grid"><PublicHeader /><main className="mx-auto max-w-4xl px-5 pb-20 pt-12 md:px-10 md:pt-24"><div className="mx-auto max-w-xl text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[hsl(38_74%_63%/0.25)] text-[hsl(164_31%_18%)]"><Search size={22} /></div><p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(9_54%_63%)]">{t('pickupStarts')}</p><h1 className="mt-3 font-display text-5xl">{t('findOrder')}</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">{t('trackHelp')}</p><div className="mt-8 rounded-2xl border border-border bg-card p-2 shadow-sm"><div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"><button data-testid="button-track-order-number" onClick={() => setMode('orderNumber')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'orderNumber' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{t('orderNumber')}</button><button data-testid="button-track-phone" onClick={() => setMode('phone')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'phone' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{t('mobile')}</button></div><div className="mt-3 flex gap-2"><input data-testid="input-track-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === 'orderNumber' ? 'مثال: EID-2048' : 'مثال: 010 1234 5678'} className="min-w-0 flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary" /><button data-testid="button-find-order" disabled={!value.trim() || trackQuery.isFetching} onClick={() => setParams(mode === 'orderNumber' ? { orderNumber: value.trim() } : { phone: value.trim() })} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40">{trackQuery.isFetching ? <Loader2 size={17} className="animate-spin" /> : t('find')}</button></div></div></div>{trackQuery.isError && <div className="mx-auto mt-8 max-w-xl"><QueryError retry={() => trackQuery.refetch()} /></div>}{params.orderNumber || params.phone ? !trackQuery.isLoading && !trackQuery.isError && orders.length === 0 ? <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-dashed border-border p-10 text-center"><p className="font-display text-2xl">{t('noOrder')}</p><p className="mt-2 text-sm text-muted-foreground">{t('checkDetails')}</p></div> : <div className="mt-10 space-y-4">{orders.map((order) => <TrackCard key={order.id} order={order} />)}</div> : null}</main></div>;
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
          <p className="mt-1 font-semibold">{order.pickupDate} — {order.pickupTime}</p>
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
  const { t } = useLanguage();
  const summaryQuery = useGetDashboardSummary();
  const todayLocal = () => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  const ordersQuery = useListOrders({ date: todayLocal() });
  const summary = summaryQuery.data as DashboardSummary | undefined;
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  const handlePrint = (order: Order) => {
    setPrintingOrder(order);
    setTimeout(() => {
      window.print();
    }, 50);
  };

  if (summaryQuery.isLoading) return <PageLoader label={t('loading')} />;
  if (summaryQuery.isError) return <QueryError retry={() => summaryQuery.refetch()} />;
  const todaysOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];
  return <div className="mx-auto max-w-[1440px]"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">{t('counterOverview')}</p><h1 className="mt-2 font-display text-4xl md:text-5xl">{t('counterOverview')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('overviewDescription')}</p></div><Link href="/admin/orders" data-testid="link-open-queue" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{t('openQueue')} <ArrowRight size={16} /></Link></div><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label={t('needsReply')} value={summary?.pendingOrders ?? 0} detail={t('newPickupRequests')} icon={Bell} tone="gold" /><MetricCard label={t('todaysPickups')} value={summary?.todayOrders ?? 0} detail={t('allTimeSlots')} icon={CalendarDays} tone="blue" /><MetricCard label={t('acceptedRevenue')} value={money.format(summary?.acceptedRevenue ?? 0)} detail={t('confirmedOrders')} icon={TrendingUp} tone="green" /><MetricCard label={t('lowStockItems')} value={summary?.lowStockCount ?? 0} detail={t('worthChecking')} icon={Package} tone="rose" /></div><div className="mt-8 grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><section className="rounded-2xl border border-border bg-card p-5 md:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t('pickupQueue')}</p><h2 className="mt-1 font-display text-2xl">{t('todayCounter')}</h2></div><Link href="/admin/orders" data-testid="link-view-all-orders" className="text-xs font-bold text-[hsl(9_54%_55%)]">{t('viewAll')}</Link></div>{ordersQuery.isLoading ? <PageLoader label={t('loadingOrders')} /> : todaysOrders.length === 0 ? <EmptyQueue /> : <div className="mt-5 divide-y divide-border">{todaysOrders.slice(0, 6).map((order) => <OrderRow key={order.id} order={order} onPrint={() => handlePrint(order)} />)}</div>}</section><section className="rounded-2xl bg-[hsl(164_31%_18%)] p-6 text-[hsl(39_45%_94%)]"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">{t('eidReadiness')}</p><h2 className="mt-2 font-display text-3xl">{t('keepJoy')}</h2></div><Sparkles size={24} className="text-[hsl(38_74%_63%)]" /></div><div className="mt-10 flex items-end gap-3"><span className="font-display text-7xl text-[hsl(38_74%_63%)]">{summary?.daysUntilEid ?? '—'}</span><span className="pb-3 text-sm text-[hsl(39_18%_69%)]">{t('daysUntilEid')}</span></div><div className="mt-6 border-t border-sidebar-border pt-5"><div className="flex justify-between text-sm"><span className="text-[hsl(39_18%_69%)]">{t('topSeller')}</span><span className="font-semibold">{summary?.topCategory || t('notEnoughData')}</span></div><Link href="/admin/analytics" data-testid="link-see-analytics" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[hsl(38_74%_63%)]">{t('seePicture')} <ArrowRight size={15} /></Link></div></section></div>{printingOrder && <PrintableReceipt order={printingOrder} />}</div>;
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

  const params = useMemo(() => ({
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(timeframe !== 'all' && timeframe !== 'custom' ? { timeframe } : {}),
    ...(customDate && timeframe === 'custom' ? { date: customDate } : {}),
  }), [search, status, timeframe, customDate]);

  const ordersQuery = useListOrders(params, {
    query: {
      queryKey: getListOrdersQueryKey(params),
      refetchInterval: 10_000,
    },
  });
  const exportQuery = useExportOrders({ range: 'week' }, { query: { enabled: false, queryKey: getExportOrdersQueryKey({ range: 'week' }) } });
  const updateOrder = useUpdateOrder();
  const selectedQuery = useGetOrder(selectedId ?? 0, { query: { enabled: selectedId !== null, queryKey: getGetOrderQueryKey(selectedId ?? 0) } });
  const rawOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];

  const displayOrders = useMemo(() => {
    return rawOrders.filter((order) => {
      const todayStr = getTodayCairo();
      const orderDateStr = order.pickupDate || (order.createdAt ? String(order.createdAt).slice(0, 10) : '');

      if (timeframe === 'today') {
        return order.pickupDate === todayStr || (order.createdAt && String(order.createdAt).slice(0, 10) === todayStr);
      }
      if (timeframe === 'week') {
        const orderDate = new Date(orderDateStr);
        if (isNaN(orderDate.getTime())) return true;
        const diffMs = Math.abs(orderDate.getTime() - Date.now());
        return diffMs <= 7 * 86400000;
      }
      if (timeframe === 'month') {
        const orderDate = new Date(orderDateStr);
        if (isNaN(orderDate.getTime())) return true;
        const diffMs = Math.abs(orderDate.getTime() - Date.now());
        return diffMs <= 31 * 86400000;
      }
      if (timeframe === 'custom' && customDate) {
        return order.pickupDate === customDate || (order.createdAt && String(order.createdAt).slice(0, 10) === customDate);
      }
      return true;
    });
  }, [rawOrders, timeframe, customDate]);

  const prevOrdersCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (Array.isArray(ordersQuery.data)) {
      if (prevOrdersCountRef.current !== null && ordersQuery.data.length > prevOrdersCountRef.current) {
        if (localStorage.getItem('order_sound_enabled') !== 'false') {
          playOrderChime();
        }
      }
      prevOrdersCountRef.current = ordersQuery.data.length;
    }
  }, [ordersQuery.data]);

  const handlePrintOrder = (order: Order) => {
    setQuickPrintOrder(order);
    setTimeout(() => {
      window.print();
    }, 50);
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

  return <div className="mx-auto max-w-[1440px]">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">{t('operations')}</p>
        <h1 className="mt-2 font-display text-4xl">{t('orderQueue')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('queueDescription')}</p>
      </div>
      <button data-testid="button-export-orders" onClick={exportCsv} disabled={exportQuery.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold">{exportQuery.isFetching ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t('exportWeek')}</button>
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
        <div className="hidden grid-cols-[1.2fr_.8fr_.6fr_.65fr_.6fr_.45fr_.45fr] gap-3 border-b border-border bg-muted/60 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:grid">
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
            return (
              <div key={order.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_.8fr_.6fr_.65fr_.6fr_.45fr_.45fr] md:items-center md:gap-3">
                <button type="button" data-testid={`button-open-order-${order.id}`} onClick={() => { setSelectedId(order.id); setStartWithDepositEdit(false); }} className="flex min-w-0 items-center gap-3 text-left">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold">{order.customerName.split(' ').map((n) => n[0]).slice(0, 2).join('')}</div>
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{order.customerName}</p><p className="font-mono-ui text-[10px] text-muted-foreground">{order.orderNumber} · {order.phoneNumber}</p></div>
                </button>
                <div className="flex items-center gap-2 text-sm md:block"><CalendarDays size={14} className="text-muted-foreground md:hidden" /><span>{order.pickupDate} · {order.pickupTime}</span></div>
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
              <CalendarDays size={13} /> {order.pickupDate} — {order.pickupTime}
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
      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
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
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="rounded-xl border border-input bg-background px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-primary"
        />
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
      {printingKitchenSlip && (
        <article className="print-receipt" dir="rtl">
          <div className="receipt-header">
            <h1>حلويات فتوح — المعمل</h1>
            <p>إذن تشغيل وخبيز يوم: {selectedDate}</p>
          </div>
          <div className="receipt-meta">
            <div><span>التاريخ</span><strong>{selectedDate}</strong></div>
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
                  <td><strong>{item.totalQty} {unitLabels[item.unit] || item.unit}</strong></td>
                  <td>{item.orderCount} طلب</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="receipt-footer">قسم الإنتاج والتجهيز — حلويات فتوح</p>
        </article>
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
  const [form, setForm] = useState({ name: '', unit: 'box', price: '', stock: '', threshold: '', imageUrl: '' });
  const openForm = (category: Category | 'new') => { setEditing(category); setForm(category === 'new' ? { name: '', unit: 'box', price: '', stock: '', threshold: '5', imageUrl: '' } : { name: category.name, unit: category.unit, price: String(category.pricePerUnit), stock: String(category.stockQuantity), threshold: String(category.lowStockThreshold ?? ''), imageUrl: category.imageUrl || '' }); };
  const save = () => { const data = { name: form.name, unit: form.unit as 'kilo' | 'box' | 'piece', pricePerUnit: Number(form.price), stockQuantity: Number(form.stock), lowStockThreshold: Number(form.threshold), imageUrl: form.imageUrl.trim() || undefined }; if (editing === 'new') createCategory.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); setEditing(null); } }); else if (editing) updateCategory.mutate({ categoryId: editing.id, data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); setEditing(null); } }); };
  const savePhoto = (imageUrl: string) => { if (!photoEditing) return; updateCategory.mutate({ categoryId: photoEditing.id, data: { imageUrl } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); setPhotoEditing(null); } }); };
  const remove = (category: Category) => { if (window.confirm(language === 'ar' ? `حذف ${category.name} من الرف؟` : `Remove ${category.name} from the shelf?`)) deleteCategory.mutate({ categoryId: category.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }) }); };
  const categories = Array.isArray(categoriesQuery.data) ? categoriesQuery.data : [];
  return <div className="mx-auto max-w-[1200px]"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">{t('stockRoom')}</p><h1 className="mt-2 font-display text-4xl">{t('categories')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('stockDescription')}</p></div><button data-testid="button-add-category" onClick={() => openForm('new')} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Plus size={16} /> {t('addCategory')}</button></div>{categoriesQuery.isLoading ? <PageLoader label={t('checkingShelf')} /> : categoriesQuery.isError ? <QueryError retry={() => categoriesQuery.refetch()} /> : categories.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center"><Package className="mx-auto text-muted-foreground" size={26} /><p className="mt-3 font-display text-2xl">{t('shelfEmpty')}</p><p className="mt-1 text-sm text-muted-foreground">{t('addFirstSweet')}</p></div> : <div className="mt-8 grid gap-4 md:grid-cols-2">{categories.map((category) => { const low = category.stockQuantity <= (category.lowStockThreshold || 0); return <div key={category.id} data-testid={`card-inventory-${category.id}`} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between"><div className="flex items-center gap-3.5"><div className="group/pic relative size-14 rounded-xl overflow-hidden border border-border shadow-sm shrink-0 cursor-pointer" onClick={() => setPhotoEditing(category)} title={t('changePhoto')}><img src={category.imageUrl || getCategoryFallbackImage(category.name)} alt={category.name} className="size-full object-cover transition-transform duration-300 group-hover/pic:scale-110" onError={(e) => { e.currentTarget.src = getCategoryFallbackImage(category.name); }} /><div className="absolute inset-0 bg-black/40 opacity-0 group-hover/pic:opacity-100 transition-opacity flex items-center justify-center text-white"><Camera size={18} /></div></div><div><div className="flex items-center gap-2"><h2 className="font-semibold">{category.name}</h2>{category.isActive === false && <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{t('hidden')}</span>}</div><p className="mt-1 text-xs text-muted-foreground">{money.format(category.pricePerUnit)} / {getUnitLabel(category.unit, language)}</p></div></div><div className={`rounded-xl p-2 ${low ? 'bg-[hsl(3_58%_48%/0.12)] text-[hsl(3_58%_42%)]' : 'bg-[hsl(153_28%_48%/0.12)] text-[hsl(153_38%_30%)]'}`}><Package size={18} /></div></div><div className="mt-7 flex items-end justify-between"><div><p className="font-display text-4xl">{category.stockQuantity}</p><p className={`mt-1 text-xs font-bold ${low ? 'text-[hsl(3_58%_42%)]' : 'text-muted-foreground'}`}>{low ? t('lowStock') : `${t('target')}: ${category.lowStockThreshold || 0}`}</p></div><div className="flex flex-wrap gap-2"><button data-testid={`button-change-photo-${category.id}`} onClick={() => setPhotoEditing(category)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Camera size={13} /> {t('changePhoto')}</button><button data-testid={`button-edit-category-${category.id}`} onClick={() => openForm(category)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Pencil size={13} /> {t('edit')}</button><button data-testid={`button-delete-category-${category.id}`} onClick={() => remove(category)} className="grid size-9 place-items-center rounded-lg border border-border text-[hsl(3_58%_42%)]" aria-label="حذف الصنف"><Trash2 size={14} /></button></div></div></div>; })}</div>}{editing && <CategoryModal editing={editing} form={form} setForm={setForm} onClose={() => setEditing(null)} onSave={save} isPending={createCategory.isPending || updateCategory.isPending} />}{photoEditing && <ChangeCategoryPictureModal category={photoEditing} onClose={() => setPhotoEditing(null)} onSave={savePhoto} isPending={updateCategory.isPending} />}</div>;
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

function CategoryModal({ editing, form, setForm, onClose, onSave, isPending }: { editing: Category | 'new'; form: { name: string; unit: string; price: string; stock: string; threshold: string; imageUrl: string }; setForm: (form: { name: string; unit: string; price: string; stock: string; threshold: string; imageUrl: string }) => void; onClose: () => void; onSave: () => void; isPending: boolean }) {
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

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(164_31%_18%/0.35)] p-0 sm:items-center sm:p-5"><div className="w-full max-w-lg rounded-t-3xl bg-card p-6 sm:rounded-3xl max-h-[92vh] overflow-y-auto"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t('shelfEditor')}</p><h2 className="mt-1 font-display text-3xl">{editing === 'new' ? t('addCategoryTitle') : t('editCategory')}</h2></div><button data-testid="button-close-category-modal" onClick={onClose} className="rounded-xl border border-border p-2" aria-label="إغلاق"><X size={17} /></button></div><div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4"><div className="flex items-center gap-3.5"><img src={previewImage} alt="صورة الصنف" className="size-16 rounded-xl object-cover border border-border shadow-sm shrink-0" onError={(e) => { e.currentTarget.src = getCategoryFallbackImage(form.name); }} /><div className="flex-1 min-w-0"><label className="block text-xs font-bold text-muted-foreground mb-1">{t('categoryImage')}</label><div className="flex gap-2"><input data-testid="input-category-image" value={form.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} placeholder={t('imageUrlPlaceholder')} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary" /><input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} /><button type="button" data-testid="button-modal-upload-photo" onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted shrink-0 text-foreground transition-colors disabled:opacity-50" title={t('uploadFromDevice')}>{isProcessing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}<span className="hidden sm:inline">{t('uploadFromDevice')}</span></button></div></div></div><div className="mt-3"><p className="text-[11px] font-semibold text-muted-foreground mb-2">{t('selectPresetImage')}</p><div className="flex flex-wrap gap-1.5">{SWEET_IMAGE_PRESETS.map((preset) => { const isSelected = form.imageUrl === preset.url; return <button key={preset.url} type="button" onClick={() => update('imageUrl', preset.url)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${isSelected ? 'border-primary bg-primary/10 font-bold text-primary' : 'border-border bg-card text-foreground hover:bg-muted'}`}><img src={preset.url} alt="" className="size-4 rounded-full object-cover" /><span>{language === 'ar' ? preset.label : preset.labelEn}</span></button>; })}</div></div></div><div className="mt-4 space-y-4"><label className="block text-sm font-bold">{t('categoryName')}<input data-testid="input-category-name" value={form.name} onChange={(e) => update('name', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" /></label><div className="grid grid-cols-2 gap-4"><label className="block text-sm font-bold">{t('unit')}<select data-testid="select-category-unit" value={form.unit} onChange={(e) => update('unit', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none"><option value="box">{t('box')}</option><option value="kilo">{t('kilo')}</option><option value="piece">{t('piece')}</option></select></label><label className="block text-sm font-bold">{t('pricePerUnit')}<input data-testid="input-category-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none" /></label><label className="block text-sm font-bold">{t('stockQuantity')}<input data-testid="input-category-stock" type="number" min="0" step="0.25" value={form.stock} onChange={(e) => update('stock', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none" /></label><label className="block text-sm font-bold">{t('lowStockAlert')}<input data-testid="input-category-threshold" type="number" min="0" value={form.threshold} onChange={(e) => update('threshold', e.target.value)} className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none" /></label></div></div><div className="mt-7 flex justify-end gap-2"><button data-testid="button-cancel-category" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted-foreground">{t('cancel')}</button><button data-testid="button-save-category" disabled={!form.name || !form.price || !form.stock || isPending} onClick={onSave} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{isPending && <Loader2 size={15} className="animate-spin" />} {t('saveCategory')}</button></div></div></div>;
}

function AnalyticsPage() {
  const { language, t } = useLanguage();
  const summaryQuery = useGetDashboardSummary();
  const analyticsQuery = useGetDashboardAnalytics({ query: { queryKey: getGetDashboardAnalyticsQueryKey() } });
  const analytics = analyticsQuery.data as DashboardAnalytics | undefined;
  const maxDaily = Math.max(...(analytics?.dailyOrders || []).map((item) => item.orders), 1);
  return <div className="mx-auto max-w-[1400px]"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(9_54%_63%)]">{t('signals')}</p><h1 className="mt-2 font-display text-4xl">{t('eidAtGlance')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('analyticsDescription')}</p></div>{summaryQuery.isLoading || analyticsQuery.isLoading ? <PageLoader label={t('gatheringSeason')} /> : summaryQuery.isError || analyticsQuery.isError ? <QueryError retry={() => { summaryQuery.refetch(); analyticsQuery.refetch(); }} /> : <><div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><section className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t('ordersSevenDays')}</p><h2 className="mt-1 font-display text-2xl">{t('warmingUp')}</h2></div><BarChart3 className="text-[hsl(9_54%_63%)]" size={23} /></div><div className="mt-8 flex h-56 items-end gap-2 border-b border-l border-border px-3 pb-0 sm:gap-4">{(analytics?.dailyOrders || []).map((point) => <div key={point.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="relative w-full max-w-12 rounded-t-lg bg-[hsl(38_74%_63%)] transition-all group-hover:bg-[hsl(9_54%_63%)]" style={{ height: `${Math.max((point.orders / maxDaily) * 85, 7)}%` }}><span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono-ui text-[10px] opacity-0 transition-opacity group-hover:opacity-100">{point.orders}</span></div><span className="font-mono-ui text-[9px] text-muted-foreground">{point.date.slice(5)}</span></div>)}</div></section><section className="rounded-2xl bg-[hsl(164_31%_18%)] p-6 text-[hsl(39_45%_94%)]"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(38_74%_63%)]">{t('countdown')}</p><div className="mt-7 flex items-baseline gap-3"><span className="font-display text-7xl text-[hsl(38_74%_63%)]">{summaryQuery.data?.daysUntilEid ?? '—'}</span><span className="text-sm text-[hsl(39_18%_69%)]">{t('daysLeft')}</span></div><p className="mt-5 text-sm leading-6 text-[hsl(39_18%_69%)]">{t('celebration')}</p><div className="mt-7 flex items-center gap-2 text-xs font-bold text-[hsl(38_74%_63%)]"><Sparkles size={14} /> {t('seasonOn')}</div></section></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t('bestLoved')}</p><h2 className="mt-1 font-display text-2xl">{t('performance')}</h2><div className="mt-6 space-y-5">{(analytics?.categoryTotals || []).map((item, index) => { const max = Math.max(...(analytics?.categoryTotals || []).map((entry) => entry.revenue), 1); return <div key={item.categoryName}><div className="flex justify-between text-sm"><span className="font-semibold">{item.categoryName}</span><span className="font-mono-ui text-xs text-muted-foreground">{money.format(item.revenue)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${index % 2 ? 'bg-[hsl(9_54%_63%)]' : 'bg-[hsl(38_74%_63%)]'}`} style={{ width: `${(item.revenue / max) * 100}%` }} /></div><p className="mt-1 text-[10px] text-muted-foreground">{item.quantity} {t('unitsSold')}</p></div> })}</div></section><section className="rounded-2xl border border-border bg-card p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{t('orderMix')}</p><h2 className="mt-1 font-display text-2xl">{t('whereStand')}</h2><div className="mt-6 grid gap-3 sm:grid-cols-2">{(analytics?.statusTotals || []).map((item) => <div key={item.status} className="flex items-center justify-between rounded-xl bg-muted p-4"><div className="flex items-center gap-3"><span className={`size-2.5 rounded-full ${item.status === 'ready' ? 'bg-[hsl(153_28%_48%)]' : item.status === 'pending' ? 'bg-[hsl(38_74%_63%)]' : 'bg-[hsl(9_54%_63%)]'}`} /><span className="text-sm font-semibold">{getStatusLabel(item.status, language)}</span></div><span className="font-display text-2xl">{item.count}</span></div>)}</div></section></div></>}</div>;
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
      const isLocalAdmin = localStorage.getItem('local_admin_session') === 'true';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(staffToken ? { 'x-staff-session': staffToken } : {}),
        ...(isLocalAdmin ? { 'x-dev-admin': 'admin' } : {}),
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
      const isLocalAdmin = localStorage.getItem('local_admin_session') === 'true';
      const headers: Record<string, string> = {
        ...(staffToken ? { 'x-staff-session': staffToken } : {}),
        ...(isLocalAdmin ? { 'x-dev-admin': 'admin' } : {}),
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
  const { signIn } = useUnifiedAuth();

  // Tab: 'owner' | 'staff'
  const [activeTab, setActiveTab] = useState<'owner' | 'staff'>('owner');

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

    const result = await signIn(ownerPassword || 'admin', ownerUsername || 'admin', 'owner');
    if (result.success) {
      setLocation('/admin');
    } else {
      setError(result.error || (language === 'ar' ? 'كلمة مرور المالك غير صحيحة' : 'Invalid owner password'));
      setLoading(false);
    }
  };

  const handleQuickAdminLogin = async () => {
    setLoading(true);
    setError('');
    setPendingNotice(false);
    const result = await signIn('admin', 'admin', 'owner');
    if (result.success) {
      setLocation('/admin');
    } else {
      setError(result.error || (language === 'ar' ? 'تعذر الدخول كمالك' : 'Failed to sign in as owner'));
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

    const result = await signIn(staffPassword, staffUsername.trim(), 'staff');
    if (result.success) {
      setLocation('/admin');
    } else {
      if (result.pendingApproval) {
        setPendingNotice(true);
      } else {
        setError(result.error || (language === 'ar' ? 'بيانات الموظف غير صحيحة' : 'Invalid staff credentials'));
      }
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

              <button
                type="button"
                onClick={handleQuickAdminLogin}
                disabled={loading}
                className="w-full rounded-xl border border-border py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                {language === 'ar' ? '⚡ دخول فوري كمالك (admin / admin)' : '⚡ Quick Owner Login (admin / admin)'}
              </button>
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

function PermissionGuard({ permission, children }: { permission: StaffPermission; children: ReactNode }) {
  const access = useStaffAccess();
  return hasPermission(access, permission) ? <>{children}</> : <PermissionDenied />;
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
    if (status === 401) return <Redirect to="/sign-in" />;
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
  const [isSignedIn, setIsSignedIn] = useState(() => localStorage.getItem('local_admin_session') === 'true');

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
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password, username, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        localStorage.setItem('local_admin_session', 'true');
        localStorage.setItem('local_staff_role', role);
        if (data.token) {
          localStorage.setItem('staff_token', data.token);
        }
        setIsSignedIn(true);
        queryClient.invalidateQueries();
        return { success: true };
      }
      return {
        success: false,
        error: data.error || (role === 'owner' ? 'كلمة مرور المالك غير صحيحة' : 'بيانات الدخول غير صحيحة'),
        pendingApproval: data.pendingApproval,
      };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم' };
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