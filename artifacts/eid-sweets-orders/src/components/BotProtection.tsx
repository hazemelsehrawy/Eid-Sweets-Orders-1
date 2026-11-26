import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '@/locales';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          language?: string;
          theme?: 'light' | 'dark' | 'auto';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export interface BotProtectionPayload {
  _hp?: string;
  _ft?: string;
  turnstileToken?: string;
}

export function getTurnstileSiteKey(): string {
  const raw =
    import.meta.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    import.meta.env.VITE_TURNSTILE_SITE_KEY ||
    '';
  return typeof raw === 'string' ? raw.trim() : '';
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  }).catch((err) => {
    turnstileScriptPromise = null;
    throw err;
  });

  return turnstileScriptPromise;
}

/**
 * Manages honeypot state, server-signed >=2s form timing token, and Cloudflare Turnstile token.
 */
export function useFormBotProtection(enabled: boolean = true) {
  const [formToken, setFormToken] = useState<string>('');
  const [honeypot, setHoneypot] = useState<string>('');
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [resetSignal, setResetSignal] = useState<number>(0);
  const turnstileSiteKey = getTurnstileSiteKey();

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch('/api/security/form-token', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as { token?: string } | null;
      if (data?.token) {
        setFormToken(data.token);
      }
    } catch {
      // Non-fatal: avoids blocking render if offline
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void fetchToken();
  }, [enabled, fetchToken]);

  const refreshProtection = useCallback(() => {
    setTurnstileToken('');
    setResetSignal((c) => c + 1);
    void fetchToken();
  }, [fetchToken]);

  const getPayloadFields = useCallback((): BotProtectionPayload => {
    const fields: BotProtectionPayload = {};
    if (honeypot) fields._hp = honeypot;
    if (formToken) fields._ft = formToken;
    if (turnstileToken) fields.turnstileToken = turnstileToken;
    return fields;
  }, [honeypot, formToken, turnstileToken]);

  return {
    formToken,
    honeypot,
    setHoneypot,
    turnstileToken,
    setTurnstileToken,
    turnstileSiteKey,
    turnstileReady: !turnstileSiteKey || Boolean(turnstileToken),
    resetSignal,
    refreshProtection,
    getPayloadFields,
  };
}

/**
 * CSS-hidden honeypot input (not type="hidden", tabindex="-1", autocomplete="off").
 * Real users never see or focus it; automated form-fillers populate it and get rejected.
 */
export function HoneypotField({
  value,
  onChange,
  fieldId,
}: {
  value: string;
  onChange: (val: string) => void;
  fieldId?: string;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-9999px',
        top: '-9999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      }}
    >
      <label htmlFor={fieldId || 'hp-website-field'}>Website</label>
      <input
        id={fieldId || 'hp-website-field'}
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * Renders the Cloudflare Turnstile widget explicitly when NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * is configured. Renders nothing (zero layout impact) when not configured.
 */
export function TurnstileWidget({
  siteKey,
  language,
  resetSignal,
  onVerify,
  onExpire,
  className = '',
}: {
  siteKey: string;
  language: Language;
  resetSignal?: number;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {}
          widgetIdRef.current = null;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          language: language === 'ar' ? 'ar' : 'en',
          theme: 'auto',
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => {
            onVerifyRef.current('');
            onExpireRef.current?.();
          },
          'error-callback': () => {
            onVerifyRef.current('');
          },
        });
      })
      .catch(() => {
        // Turnstile script blocked or unreachable; server handles fallback
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, language]);

  useEffect(() => {
    if (!siteKey || !resetSignal || !widgetIdRef.current || !window.turnstile) return;
    try {
      window.turnstile.reset(widgetIdRef.current);
    } catch {}
  }, [siteKey, resetSignal]);

  if (!siteKey) return null;

  return (
    <div
      className={`flex justify-center py-1 ${className}`}
      data-testid="turnstile-widget-container"
    >
      <div ref={containerRef} />
    </div>
  );
}
