import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import type { Order } from '@workspace/api-client-react';

const money = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 2,
});

const unitLabels: Record<string, string> = {
  box: 'علبة',
  kilo: 'كيلو',
  piece: 'قطعة',
};

const paymentMethodLabels: Record<string, string> = {
  cash: 'نقداً عند الاستلام',
  instapay: 'إنستاباي (InstaPay)',
  vodafone_cash: 'فودافون كاش',
  card: 'بطاقة بنكية',
};

const paymentStatusLabels: Record<string, string> = {
  unpaid: 'غير مدفوع',
  partially_paid: 'عربون مدفوع',
  paid: 'مدفوع بالكامل',
};

interface PrintableReceiptProps {
  order: Order;
}

export function PrintableReceipt({ order }: PrintableReceiptProps) {
  const [mounted, setMounted] = useState(false);
  const formattedDate = order.createdAt
    ? String(order.createdAt).slice(0, 10)
    : '';
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const trackUrl = `${window.location.origin}/track?orderNumber=${encodeURIComponent(order.orderNumber)}`;
    QRCode.toDataURL(trackUrl, {
      width: 140,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [order.orderNumber]);

  const deposit = order.depositAmount ?? 0;
  const remaining =
    order.remainingBalance !== undefined
      ? order.remainingBalance
      : Math.max(0, order.totalPrice - deposit);

  const paymentMethodText =
    paymentMethodLabels[order.paymentMethod || 'cash'] || order.paymentMethod || 'نقداً';

  const defaultStatus =
    deposit >= order.totalPrice && order.totalPrice > 0
      ? 'paid'
      : deposit > 0
      ? 'partially_paid'
      : 'unpaid';
  const paymentStatusText =
    paymentStatusLabels[order.paymentStatus || defaultStatus] || order.paymentStatus || '';

  const receiptContent = (
    <article className="print-receipt" dir="rtl" data-testid="printable-receipt">
      <div className="receipt-header">
        <h1>حلويات فتوح</h1>
        <p>إيصال حجز واستلام طلب</p>
      </div>
      <div className="receipt-meta">
        <div>
          <span>رقم الطلب</span>
          <strong dir="ltr">{order.orderNumber}</strong>
        </div>
        <div>
          <span>التاريخ</span>
          <strong dir="ltr">{formattedDate}</strong>
        </div>
      </div>
      <div className="receipt-customer">
        <div className="receipt-customer-row">
          <span>العميل:</span>
          <strong>{order.customerName}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>الموبايل:</span>
          <strong dir="ltr">{order.phoneNumber}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>موعد الاستلام:</span>
          <strong dir="ltr">
            {order.pickupDate} — {order.pickupTime}
          </strong>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>{item.categoryName}</td>
              <td>
                {item.quantity} {unitLabels[item.unit] || item.unit}
              </td>
              <td dir="ltr">{money.format(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-total">
        <span>الإجمالي:</span>
        <strong dir="ltr">{money.format(order.totalPrice)}</strong>
      </div>
      <div className="receipt-financials">
        <div className="receipt-customer-row">
          <span>المدفوع (عربون):</span>
          <strong dir="ltr">{money.format(deposit)}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>المتبقي للاستلام:</span>
          <strong dir="ltr">{money.format(remaining)}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>طريقة الدفع:</span>
          <strong>{paymentMethodText}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>حالة السداد:</span>
          <strong>{paymentStatusText}</strong>
        </div>
      </div>
      {order.notes && (
        <p className="receipt-note">
          <strong>ملاحظات:</strong> {order.notes}
        </p>
      )}
      {qrDataUrl && (
        <div className="receipt-qr">
          <img src={qrDataUrl} alt="Order QR" className="receipt-qr-img" />
          <p className="receipt-qr-text">امسح الكود لتتبع حالة طلبك من الهاتف</p>
        </div>
      )}
      <p className="receipt-footer">شكرًا لاختياركم حلويات فتوح — كل عام وأنتم بخير</p>
    </article>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(receiptContent, document.body);
}

export default PrintableReceipt;
