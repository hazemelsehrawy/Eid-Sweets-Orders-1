export type FormatLanguage = 'ar' | 'en';

export type OrderStatusFilter =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'rejected';

export type OrdersTimeframeFilter = 'all' | 'today' | 'week' | 'month' | 'custom';

const VALID_ORDER_STATUSES = new Set<OrderStatusFilter>([
  'pending',
  'accepted',
  'preparing',
  'ready',
  'delivered',
  'rejected',
]);

const VALID_TIMEFRAMES = new Set<OrdersTimeframeFilter>([
  'all',
  'today',
  'week',
  'month',
  'custom',
]);

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(language: FormatLanguage, isWhole: boolean): Intl.NumberFormat {
  const key = `${language}-${isWhole ? 'int' : 'dec'}`;
  const cached = currencyFormatters.get(key);
  if (cached) return cached;

  const locale = language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-EG';
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  currencyFormatters.set(key, formatter);
  return formatter;
}

export function formatCurrency(amount: number, language: FormatLanguage = 'ar'): string {
  const numeric = Number(amount);
  const safe = Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
  const isWhole = Math.abs(safe - Math.trunc(safe)) < 1e-9;
  return getCurrencyFormatter(language, isWhole).format(safe);
}

export function formatCairoDisplayDate(
  language: FormatLanguage = 'ar',
  date: Date = new Date(),
): string {
  const locale = language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'Africa/Cairo',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function parseOrdersQueryParams(search: string): {
  status?: OrderStatusFilter;
  timeframe?: OrdersTimeframeFilter;
  orderId?: number;
} {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawStatus = params.get('status') as OrderStatusFilter | null;
  const rawTimeframe = params.get('timeframe') as OrdersTimeframeFilter | null;
  const rawOrderId = params.get('orderId');

  const parsed: {
    status?: OrderStatusFilter;
    timeframe?: OrdersTimeframeFilter;
    orderId?: number;
  } = {};

  if (rawStatus && VALID_ORDER_STATUSES.has(rawStatus)) {
    parsed.status = rawStatus;
  }
  if (rawTimeframe && VALID_TIMEFRAMES.has(rawTimeframe)) {
    parsed.timeframe = rawTimeframe;
  }
  if (rawOrderId) {
    const id = Number.parseInt(rawOrderId, 10);
    if (Number.isInteger(id) && id > 0) {
      parsed.orderId = id;
    }
  }

  return parsed;
}
