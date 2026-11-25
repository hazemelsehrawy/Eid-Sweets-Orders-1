import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Check, Copy, Lock, MessageCircle, Printer, QrCode, Smartphone } from 'lucide-react';
import type { Language } from '@/locales';

export const STAFF_PORTAL_PATH = '/fetoh-pos';

interface StaffPortalShareCardProps {
  language: Language;
}

function resolvePortalUrl(): string {
  if (typeof window === 'undefined') {
    return STAFF_PORTAL_PATH;
  }
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${basePath}${STAFF_PORTAL_PATH}`;
}

/**
 * Owner-only card on TeamPage displaying the private `/fetoh-pos` staff login URL,
 * live scannable QR code, WhatsApp share action, and 72mm thermal counter QR slip print.
 */
export function StaffPortalShareCard({ language }: StaffPortalShareCardProps) {
  const portalUrl = resolvePortalUrl();
  const [previewQrUrl, setPreviewQrUrl] = useState<string>('');
  const [printQrUrl, setPrintQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isPrintingQr, setIsPrintingQr] = useState(false);

  const copyTimerRef = useRef<number | null>(null);
  const printTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(portalUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#1f3b33', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setPreviewQrUrl(url);
      })
      .catch(() => {
        // Leave empty fallback icon if canvas/QR fails
      });

    void QRCode.toDataURL(portalUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setPrintQrUrl(url);
      })
      .catch(() => {
        // Fallback handled in print markup
      });

    return () => {
      active = false;
    };
  }, [portalUrl]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setIsPrintingQr(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (printTimerRef.current !== null) {
        window.clearTimeout(printTimerRef.current);
      }
      setIsPrintingQr(false);
    };
  }, []);

  const handleCopy = async () => {
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(portalUrl);
        success = true;
      }
    } catch {
      success = false;
    }

    if (!success) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = portalUrl;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    }
  };

  const handlePrintCounterQr = () => {
    setIsPrintingQr(true);
    if (printTimerRef.current !== null) {
      window.clearTimeout(printTimerRef.current);
    }
    printTimerRef.current = window.setTimeout(() => {
      window.print();
    }, 100);
  };

  const whatsappMessage =
    language === 'ar'
      ? `مرحباً، هذا رابط بوابة دخول الموظفين الخاصة بحلويات فتوح (خاص بفريق العمل فقط):\n${portalUrl}\n\nنصيحة: افتح الرابط على هاتفك واختر "إضافة إلى الشاشة الرئيسية" للدخول بضغطة واحدة.`
      : `Hello, here is the private staff login portal for Fetoh Sweets (for team members only):\n${portalUrl}\n\nTip: Open the link on your phone and choose "Add to Home Screen" for 1-tap access.`;

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
  const activePrintQr = printQrUrl || previewQrUrl;

  return (
    <section
      data-testid="card-staff-portal-share"
      className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Lock size={20} />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">
                {language === 'ar' ? 'بوابة دخول الموظفين الخاصة' : 'Private Staff Login Portal'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {language === 'ar'
                  ? 'لا تظهر أي أزرار أو روابط دخول للعملاء على صفحة المتجر. يفتح الموظفون لوحة العمل عبر هذا الرابط الخاص أو بمسح كود الكاشير، ويمكنهم تثبيته على الشاشة الرئيسية للهاتف.'
                  : 'Customers cannot see any admin or staff login link on the storefront. Share this private link or print the counter QR for employees so they can pin it to their phone Home Screen.'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 flex items-center justify-between gap-2">
            <span
              dir="ltr"
              data-testid="text-staff-portal-url"
              className="font-mono-ui text-xs font-semibold text-foreground break-all select-all"
            >
              {portalUrl}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="button-copy-portal-link"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>
                {copied
                  ? language === 'ar'
                    ? 'تم النسخ'
                    : 'Copied'
                  : language === 'ar'
                    ? 'نسخ الرابط'
                    : 'Copy Link'}
              </span>
            </button>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-share-portal-whatsapp"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all"
            >
              <MessageCircle size={14} className="text-emerald-700 dark:text-emerald-400" />
              <span>{language === 'ar' ? 'مشاركة عبر واتساب' : 'Share via WhatsApp'}</span>
            </a>

            <button
              type="button"
              data-testid="button-print-portal-qr"
              disabled={!activePrintQr}
              onClick={handlePrintCounterQr}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted active:scale-95 transition-all disabled:opacity-50"
            >
              <Printer size={14} />
              <span>{language === 'ar' ? 'طباعة كود الكاشير' : 'Print Counter QR'}</span>
            </button>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Smartphone size={13} className="shrink-0 text-primary" />
            <span>
              {language === 'ar'
                ? 'ينصح بفتح الرابط مرة واحدة على هاتف الموظف واختيار «إضافة إلى الشاشة الرئيسية» ليعمل كتطبيق مستقل.'
                : 'Recommended: have each employee open the link once and tap "Add to Home Screen" for 1-tap daily shift access.'}
            </span>
          </p>
        </div>

        <div className="flex flex-col items-center justify-center shrink-0">
          <div className="rounded-2xl border border-border bg-white p-3 shadow-xs">
            {previewQrUrl ? (
              <img
                src={previewQrUrl}
                alt={language === 'ar' ? 'كود QR لبوابة الموظفين' : 'Staff Portal QR Code'}
                className="size-36 object-contain"
              />
            ) : (
              <div className="grid size-36 place-items-center text-muted-foreground">
                <QrCode size={40} />
              </div>
            )}
          </div>
          <span className="mt-2 text-[11px] font-semibold text-muted-foreground">
            {language === 'ar' ? 'امسح بالكاميرا للدخول' : 'Scan to open portal'}
          </span>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        isPrintingQr &&
        createPortal(
          <article
            className="print-receipt"
            dir="rtl"
            data-testid="printable-staff-portal-qr"
          >
            <div className="receipt-header">
              <h1>حلويات فتوح</h1>
              <p>بوابة دخول الموظفين (خاص بالكاشير)</p>
            </div>

            {activePrintQr && (
              <img
                src={activePrintQr}
                alt="QR"
                style={{ width: '48mm', height: '48mm', margin: '10px auto', display: 'block' }}
              />
            )}

            <div
              dir="ltr"
              style={{
                textAlign: 'center',
                fontSize: '9.5px',
                fontWeight: 700,
                wordBreak: 'break-all',
                marginBottom: '8px',
                fontFamily: 'monospace',
              }}
            >
              {portalUrl}
            </div>

            <div
              style={{
                borderTop: '1px dashed #000',
                paddingTop: '6px',
                textAlign: 'center',
                fontSize: '10px',
                lineHeight: 1.45,
              }}
            >
              امسح الكود بكاميرا الهاتف ثم اختر "إضافة للشاشة الرئيسية" — لا يُشارك مع العملاء
            </div>
          </article>,
          document.body,
        )}
    </section>
  );
}
