import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="surface-grid flex min-h-[100dvh] w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center warm-shadow">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[hsl(9_54%_63%/0.14)] text-[hsl(9_54%_50%)]"><AlertCircle size={27} /></div>
        <h1 className="mt-5 font-display text-4xl">الصفحة دي مش موجودة</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">الرابط ممكن يكون قديم، لكن رف الحلويات لسه مفتوح.</p>
        <Link href="/" data-testid="link-not-found-home" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">العودة للمحل</Link>
      </div>
    </div>
  );
}
