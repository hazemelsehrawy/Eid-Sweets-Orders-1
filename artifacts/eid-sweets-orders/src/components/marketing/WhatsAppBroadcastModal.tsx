import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageCircle,
  Send,
  CheckCircle2,
  Clock,
  Sparkles,
  Copy,
  RotateCcw,
  Search,
  X,
  ExternalLink,
  User,
  Phone,
  ShoppingBag,
  Check,
  CheckSquare,
  Square,
  Minus,
} from 'lucide-react';

export interface CustomerSummary {
  phoneNumber: string;
  normalizedPhone: string;
  customerName: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string;
}

export function normalizeWhatsAppNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  const cleaned = rawPhone.replace(/\D/g, '');
  // Standard Egyptian mobile numbers (010, 011, 012, 015)
  if (/^01[0125]\d{8}$/.test(cleaned)) {
    return `20${cleaned.slice(1)}`;
  }
  // Egyptian numbers already starting with 201...
  if (/^201[0125]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

export function toggleCustomerDeselection(deselectedPhones: Set<string>, phoneNumber: string): Set<string> {
  const next = new Set(deselectedPhones);
  if (next.has(phoneNumber)) {
    next.delete(phoneNumber);
  } else {
    next.add(phoneNumber);
  }
  return next;
}

export function toggleSelectAllDeselection(
  deselectedPhones: Set<string>,
  visiblePhoneNumbers: string[],
): Set<string> {
  const allVisibleSelected =
    visiblePhoneNumbers.length > 0 && visiblePhoneNumbers.every((phone) => !deselectedPhones.has(phone));
  const next = new Set(deselectedPhones);
  if (allVisibleSelected) {
    visiblePhoneNumbers.forEach((phone) => next.add(phone));
  } else {
    visiblePhoneNumbers.forEach((phone) => next.delete(phone));
  }
  return next;
}

const TEMPLATES = [
  {
    id: 'eid_discount',
    title: '🌙 عرض عيد الفطر والخصومات',
    text: `أهلاً {الاسم} 👋 بمناسبة حلول عيد الفطر المبارك 🌙 يسر حلويات العيد تقديم خصومات حصرية لك على الكعك الفاخر، الغريبة بالسمن البلدي، والبيتي فور المشكل! 🍯✨\n\nتفضل بالطلب المبكر الآن لضمان موعد الاستلام المفضل لك عبر رابط متجرنا:\n{الرابط}`,
  },
  {
    id: 'fresh_batch',
    title: '🧁 تشكيلة جديدة طازجة',
    text: `مرحباً {الاسم} 🌸 تم بحمد الله تجهيز تشكيلة طازجة وجديدة من كعك العيد، البسكويت المقرمش، والسابليه الفاخر بالسمن البلدي 🧁\n\nيمكنك مراجعة قائمة الأصناف وتفاصيل الطلب عبر الرابط:\n{الرابط}`,
  },
  {
    id: 'early_reminder',
    title: '⏳ تذكير بالحجز المسبق',
    text: `أهلاً {الاسم} ✨ نود تذكيرك بأن مواعيد استلام طلبات العيد بدأت تمتلئ! احجز طلبك الآن قبل اكتمال العدد لضمان استلام حلوياتك طازجة في موعدك المحدد:\n{الرابط}`,
  },
];

const LOCAL_STORAGE_KEY = 'eid_sweets_whatsapp_broadcast_sent';

export function WhatsAppBroadcastModal({
  isOpen,
  onClose,
  language = 'ar',
}: {
  isOpen: boolean;
  onClose: () => void;
  language?: 'ar' | 'en';
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('eid_discount');
  const [message, setMessage] = useState(TEMPLATES[0].text);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedNumbers, setCopiedNumbers] = useState(false);
  const [deselectedPhones, setDeselectedPhones] = useState<Set<string>>(() => new Set());
  const [sentPhones, setSentPhones] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {}
    return new Set();
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync sent phones to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(Array.from(sentPhones)));
    } catch {}
  }, [sentPhones]);

  // Fetch unique customers list
  const { data: customers = [], isLoading, error } = useQuery<CustomerSummary[]>({
    queryKey: ['/api/customers'],
    queryFn: async () => {
      const staffToken = localStorage.getItem('staff_token');
      const headers: Record<string, string> = {
        ...(staffToken ? { 'x-staff-session': staffToken, Authorization: `Bearer ${staffToken}` } : {}),
      };
      const res = await fetch('/api/customers', { headers, credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to fetch customers');
      }
      return res.json();
    },
    enabled: isOpen,
  });

  // Filtered customer list for display
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.phoneNumber.includes(q) ||
        c.normalizedPhone.includes(q),
    );
  }, [customers, searchQuery]);

  const isCustomerSelected = (c: CustomerSummary) => !deselectedPhones.has(c.phoneNumber);

  const selectedCustomers = useMemo(() => {
    return customers.filter((c) => !deselectedPhones.has(c.phoneNumber));
  }, [customers, deselectedPhones]);

  const allFilteredSelected =
    filteredCustomers.length > 0 && filteredCustomers.every((c) => !deselectedPhones.has(c.phoneNumber));
  const someFilteredSelected =
    !allFilteredSelected && filteredCustomers.some((c) => !deselectedPhones.has(c.phoneNumber));

  const totalCustomersCount = customers.length;
  const selectedCount = selectedCustomers.length;
  const sentCount = useMemo(() => {
    return selectedCustomers.filter((c) => sentPhones.has(c.normalizedPhone) || sentPhones.has(c.phoneNumber)).length;
  }, [selectedCustomers, sentPhones]);

  const percentage = selectedCount > 0 ? Math.round((sentCount / selectedCount) * 100) : 0;

  // Next pending customer (scoped to selected customers)
  const nextPendingCustomer = useMemo(() => {
    return selectedCustomers.find((c) => !sentPhones.has(c.normalizedPhone) && !sentPhones.has(c.phoneNumber));
  }, [selectedCustomers, sentPhones]);

  const handleToggleCustomer = (phoneNumber: string) => {
    setDeselectedPhones((prev) => toggleCustomerDeselection(prev, phoneNumber));
  };

  const handleToggleSelectAllFiltered = () => {
    setDeselectedPhones((prev) =>
      toggleSelectAllDeselection(
        prev,
        filteredCustomers.map((c) => c.phoneNumber),
      ),
    );
  };

  // Helper to compile text for a specific customer
  const compileMessage = (template: string, customer?: CustomerSummary | null) => {
    const storeUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const name = customer?.customerName?.trim() || (language === 'ar' ? 'أحمد محمود' : 'Ahmed Mahmoud');
    const phone = customer?.phoneNumber || '01012345678';

    return template
      .replace(/{الاسم}/g, name)
      .replace(/{name}/gi, name)
      .replace(/{الرابط}/g, storeUrl)
      .replace(/{url}/gi, storeUrl)
      .replace(/{الهاتف}/g, phone)
      .replace(/{phone}/gi, phone);
  };

  const handleSendToCustomer = (customer: CustomerSummary) => {
    const text = compileMessage(message, customer);
    const normalized = customer.normalizedPhone || normalizeWhatsAppNumber(customer.phoneNumber);
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;

    window.open(url, '_blank', 'noopener,noreferrer');

    // Mark as sent
    setSentPhones((prev) => {
      const next = new Set(prev);
      next.add(customer.normalizedPhone);
      next.add(customer.phoneNumber);
      return next;
    });
  };

  const handleInsertTag = (tag: string) => {
    if (!textareaRef.current) {
      setMessage((prev) => prev + ` ${tag} `);
      return;
    }
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = message;
    const updated = current.substring(0, start) + tag + current.substring(end);
    setMessage(updated);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleResetCampaign = () => {
    const confirmMsg =
      language === 'ar'
        ? 'هل أنت متأكد من إعادة تعيين سجل الإرسال لهذه الحملة؟'
        : 'Are you sure you want to reset the sent history for this campaign?';
    if (window.confirm(confirmMsg)) {
      setSentPhones(new Set());
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {}
    }
  };

  const handleCopyAllNumbers = () => {
    const numbersList = selectedCustomers
      .map((c) => c.normalizedPhone || normalizeWhatsAppNumber(c.phoneNumber))
      .filter(Boolean)
      .join(', ');

    if (!numbersList) return;
    navigator.clipboard.writeText(numbersList);
    setCopiedNumbers(true);
    setTimeout(() => setCopiedNumbers(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="modal-whatsapp-broadcast"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-border bg-card text-foreground shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-4 bg-muted/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MessageCircle size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold font-display">
                  {language === 'ar' ? 'حملات ورسائل عروض واتساب' : 'WhatsApp Offers & Broadcast'}
                </h3>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                  {totalCustomersCount} {language === 'ar' ? 'عميل' : 'clients'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {language === 'ar'
                  ? 'إرسال مباشر مخصص لكل عميل باسمه لتفادي الحظر وبدون أي تكلفة'
                  : 'Personalized 1-click messages per customer without account ban risks'}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="button-close-whatsapp-modal"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Preset Templates */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-2">
              {language === 'ar' ? 'اختر قالباً جاهزاً للعرض:' : 'Choose a ready template:'}
            </label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(tmpl.id);
                    setMessage(tmpl.text);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    selectedTemplateId === tmpl.id
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 shadow-xs'
                      : 'border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles size={13} className={selectedTemplateId === tmpl.id ? 'text-emerald-600' : 'text-muted-foreground'} />
                  <span>{tmpl.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Message Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground">
                {language === 'ar' ? 'نص الرسالة:' : 'Message Text:'}
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">{language === 'ar' ? 'إدراج متغير:' : 'Insert tag:'}</span>
                <button
                  type="button"
                  onClick={() => handleInsertTag('{الاسم}')}
                  className="rounded-lg border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-bold text-foreground hover:bg-muted hover:border-primary transition-colors"
                >
                  🏷️ {'{الاسم}'}
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertTag('{الرابط}')}
                  className="rounded-lg border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-bold text-foreground hover:bg-muted hover:border-primary transition-colors"
                >
                  🔗 {'{الرابط}'}
                </button>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={language === 'ar' ? 'اكتب رسالتك هنا واستخدم {الاسم} للتخصيص...' : 'Type message here...'}
              className="w-full rounded-2xl border border-border bg-background p-3.5 text-xs sm:text-sm font-sans leading-relaxed focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {language === 'ar' ? 'سيتم استبدال {الاسم} باسم كل عميل تلقائياً.' : '{الاسم} is dynamically replaced.'}
              </span>
              <span>{message.length} {language === 'ar' ? 'حرف' : 'chars'}</span>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center gap-1.5">
                <MessageCircle size={14} className="text-emerald-600 dark:text-emerald-400" />
                {language === 'ar' ? 'معاينة الرسالة كما ستصل للعميل:' : 'Live WhatsApp Preview:'}
              </span>
              <span className="opacity-75 font-normal">
                {language === 'ar' ? '(مثال: أحمد محمود)' : '(Example: Ahmed)'}
              </span>
            </div>
            <div className="rounded-xl bg-white dark:bg-[#005c4b] p-3 text-xs sm:text-sm leading-relaxed text-slate-900 dark:text-emerald-50 shadow-xs border border-emerald-500/20 whitespace-pre-wrap font-sans">
              {compileMessage(message, nextPendingCustomer || customers[0] || null)}
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-emerald-200/70 mt-1">
                <span>10:30 AM</span>
                <span className="text-sky-500 dark:text-emerald-300 font-bold">✓✓</span>
              </div>
            </div>
          </div>

          {/* Sequential Dispatch Bar */}
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-1.5">
                <Send size={14} className="text-primary" />
                {language === 'ar' ? 'نسبة التقدم في الحملة:' : 'Campaign Progress:'}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-primary">
                  {sentCount} / {selectedCount} ({percentage}%)
                </span>
                {sentCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetCampaign}
                    title={language === 'ar' ? 'إعادة تعيين التقدم' : 'Reset progress'}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-border overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: `${percentage}%` }}
              />
            </div>

            {/* Primary Action Button */}
            {selectedCount === 0 ? (
              <div className="text-center py-2.5 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-bold border border-amber-500/20">
                {language === 'ar'
                  ? 'يرجى تحديد عميل واحد على الأقل لإرسال الرسالة'
                  : 'Please select at least one client to send the message'}
              </div>
            ) : nextPendingCustomer ? (
              <button
                type="button"
                data-testid="button-whatsapp-send-next"
                onClick={() => handleSendToCustomer(nextPendingCustomer)}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white py-3.5 px-4 text-sm font-bold shadow-md shadow-emerald-600/20 transition-all"
              >
                <MessageCircle size={18} className="fill-current" />
                <span>
                  {language === 'ar'
                    ? `إرسال للعميل التالي: [ ${nextPendingCustomer.customerName} - ${nextPendingCustomer.phoneNumber} ]`
                    : `Send to Next: [ ${nextPendingCustomer.customerName} ]`}
                </span>
              </button>
            ) : (
              <div className="text-center py-2.5 rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-500/20">
                🎉 {language === 'ar' ? 'تم إرسال الرسالة بنجاح لجميع العملاء المحددين!' : 'All selected clients have received the message!'}
              </div>
            )}
          </div>

          {/* Customer Directory Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h4 className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                <User size={15} className="text-muted-foreground" />
                <span>{language === 'ar' ? 'دليل العملاء المستهدفين:' : 'Target Clients List:'}</span>
                <span className="text-muted-foreground font-normal text-xs">({filteredCustomers.length})</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {language === 'ar'
                    ? `المحدد: ${selectedCount} من ${totalCustomersCount}`
                    : `Selected: ${selectedCount} / ${totalCustomersCount}`}
                </span>
              </h4>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* Search Bar */}
                <div className="relative flex-1 sm:w-56">
                  <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === 'ar' ? 'بحث بالاسم أو الرقم...' : 'Search client...'}
                    className="w-full rounded-xl border border-border bg-background ps-8 pe-3 py-1.5 text-xs focus:border-primary focus:outline-hidden"
                  />
                </div>

                {/* Copy Selected Numbers */}
                <button
                  type="button"
                  onClick={handleCopyAllNumbers}
                  disabled={selectedCount === 0}
                  title={language === 'ar' ? 'نسخ الأرقام المحددة' : 'Copy selected numbers'}
                  className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:pointer-events-none shrink-0"
                >
                  {copiedNumbers ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  <span className="hidden sm:inline">{copiedNumbers ? (language === 'ar' ? 'تم النسخ' : 'Copied') : (language === 'ar' ? 'نسخ الأرقام' : 'Copy Numbers')}</span>
                </button>
              </div>
            </div>

            {/* Select All / Deselect All Bar */}
            {filteredCustomers.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={allFilteredSelected ? true : someFilteredSelected ? 'mixed' : false}
                  data-testid="button-whatsapp-select-all"
                  onClick={handleToggleSelectAllFiltered}
                  className="inline-flex items-center gap-2 font-bold text-foreground hover:text-primary transition-colors"
                >
                  {allFilteredSelected ? (
                    <CheckSquare size={16} className="text-primary shrink-0" />
                  ) : someFilteredSelected ? (
                    <span className="grid size-4 place-items-center rounded-[3px] bg-primary text-primary-foreground shrink-0">
                      <Minus size={12} strokeWidth={3} />
                    </span>
                  ) : (
                    <Square size={16} className="text-muted-foreground shrink-0" />
                  )}
                  <span>
                    {allFilteredSelected
                      ? (language === 'ar' ? 'إلغاء تحديد الكل' : 'Deselect All')
                      : (language === 'ar' ? 'تحديد الكل' : 'Select All')}
                  </span>
                </button>
                <span className="text-[11px] text-muted-foreground">
                  {language === 'ar'
                    ? `${filteredCustomers.filter(isCustomerSelected).length} من ${filteredCustomers.length} ظاهر`
                    : `${filteredCustomers.filter(isCustomerSelected).length} of ${filteredCustomers.length} shown`}
                </span>
              </div>
            )}

            {/* Customers List Box */}
            <div className="rounded-2xl border border-border divide-y divide-border/60 max-h-56 overflow-y-auto bg-card">
              {isLoading ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  {language === 'ar' ? 'جاري تحميل قائمة العملاء...' : 'Loading clients...'}
                </div>
              ) : error ? (
                <div className="text-center py-6 text-xs text-destructive">
                  {language === 'ar' ? 'فشل تحميل بيانات العملاء' : 'Failed to load clients'}
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  {language === 'ar' ? 'لم يتم العثور على عملاء' : 'No clients found'}
                </div>
              ) : (
                filteredCustomers.map((c) => {
                  const isSent = sentPhones.has(c.normalizedPhone) || sentPhones.has(c.phoneNumber);
                  const isSelected = isCustomerSelected(c);
                  return (
                    <div
                      key={c.phoneNumber}
                      className={`flex items-center justify-between p-3 text-xs hover:bg-muted/40 transition-colors ${
                        !isSelected ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={c.customerName || c.phoneNumber}
                          onClick={() => handleToggleCustomer(c.phoneNumber)}
                          className="p-0.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-primary" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                        <div
                          className={`grid size-8 place-items-center rounded-full text-xs font-bold shrink-0 ${
                            isSent
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {isSent ? <CheckCircle2 size={16} /> : <User size={14} />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold truncate text-foreground">{c.customerName || (language === 'ar' ? 'عميل' : 'Client')}</p>
                          <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                            <span>{c.phoneNumber}</span>
                            <span>•</span>
                            <span>
                              {c.totalOrders} {language === 'ar' ? 'طلب' : 'orders'}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                            <CheckCircle2 size={12} />
                            <span>{language === 'ar' ? 'تم الإرسال' : 'Sent'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                            <Clock size={12} />
                            <span>{language === 'ar' ? 'قيد الانتظار' : 'Pending'}</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleSendToCustomer(c)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                        >
                          <MessageCircle size={12} />
                          <span>{isSent ? (language === 'ar' ? 'إعادة' : 'Resend') : (language === 'ar' ? 'إرسال' : 'Send')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3.5 bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {language === 'ar'
              ? '💡 نصيحة: إرسال الرسائل عبر واتساب ويب آمن 100% ولا يعرض رقمك للحظر.'
              : '💡 Tip: Sending via WhatsApp web is 100% safe from number bans.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 font-bold text-foreground hover:bg-muted"
          >
            {language === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
