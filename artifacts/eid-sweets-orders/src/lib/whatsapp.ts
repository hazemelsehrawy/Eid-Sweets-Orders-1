import type { Order } from '@workspace/api-client-react';

export const moneyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 2,
});

export function getWhatsAppLink(order: Order, _language?: string): string {
  let cleanPhone = String(order.phoneNumber || '')
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '2' + cleanPhone;
  } else if (!cleanPhone.startsWith('20') && cleanPhone.length === 10) {
    cleanPhone = '20' + cleanPhone;
  }

  const total = moneyFormatter.format(order.totalPrice);
  const deposit = moneyFormatter.format(order.depositAmount ?? 0);
  const remaining = moneyFormatter.format(
    order.remainingBalance !== undefined
      ? order.remainingBalance
      : Math.max(0, order.totalPrice - (order.depositAmount ?? 0))
  );

  let text = '';
  if (order.status === 'pending') {
    text = `مرحباً بك يا ${order.customerName}! 🌸\nتم استلام طلب حجز حلويات العيد رقم #${order.orderNumber} بمبلغ ${total}.\nموعد الاستلام: ${order.pickupDate} الساعة ${order.pickupTime}.\nسنقوم بتأكيد الطلب قريباً. حلويات فتوح 🍰`;
  } else if (order.status === 'accepted') {
    text = `أهلاً بك يا ${order.customerName}! 🎉\nتم تأكيد حجز طلبك رقم #${order.orderNumber} من حلويات فتوح.\nإجمالي الحساب: ${total} (العربون المدفوع: ${deposit}، المتبقي: ${remaining}).\nموعد الاستلام المحدد: ${order.pickupDate} الساعة ${order.pickupTime}.\nنسعد بخدمتكم وكل عام وأنتم بخير! ✨`;
  } else if (order.status === 'preparing') {
    text = `أهلاً بك يا ${order.customerName}! 👨‍🍳\nنقوم الآن بتجهيز وخبز طلبك رقم #${order.orderNumber} في معمل حلويات فتوح بكل حب وإتقان.\nسنبلغك فور جاهزية العلب للاستلام. عيد سعيد! 🍬`;
  } else if (order.status === 'ready') {
    text = `أهلاً بك يا ${order.customerName}! 🛍️\nطلبك رقم #${order.orderNumber} جاهز للاستلام الآن من الفرع!\nالمتبقي للدفع: ${remaining}.\nبانتظار زيارتكم الكريمة في أي وقت. حلويات فتوح ✨`;
  } else if (order.status === 'delivered') {
    text = `عيدكم مبارك وكل عام وأنتم بخير يا ${order.customerName}! 🌙✨\nتم تسليم طلبكم رقم #${order.orderNumber}. نتمنى أن تنال حلويات فتوح إعجابكم وإعجاب العائلة الكريمة.\nأعاده الله عليكم باليمن والبركات! 🧁`;
  } else {
    text = `مرحباً ${order.customerName} بخصوص طلبكم #${order.orderNumber} من حلويات فتوح.`;
  }

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}
