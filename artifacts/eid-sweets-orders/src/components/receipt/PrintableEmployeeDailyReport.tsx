import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency } from '@/lib/format';
import { formatDualDate } from '@/lib/hijri';
import type { DailyEmployeeRevenueRow, EmployeeProfileUser } from '@/components/shifts/ShiftControlBar';

interface PrintableEmployeeDailyReportProps {
  employee: EmployeeProfileUser;
  day: DailyEmployeeRevenueRow;
}

function formatCairoTime(iso: string | null): string {
  if (!iso) return 'نشطة الآن';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(11, 16);
  }
}

export function PrintableEmployeeDailyReport({
  employee,
  day,
}: PrintableEmployeeDailyReportProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const printedAt = (() => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 16);
    }
  })();

  const content = (
    <article
      className="print-receipt"
      dir="rtl"
      data-testid="printable-employee-daily-report"
    >
      <div className="receipt-header">
        <h1>حلويات فتوح</h1>
        <p>تقرير إيراد موظف يومي (Z-Report)</p>
      </div>

      <div className="receipt-meta">
        <div>
          <span>الموظف</span>
          <strong>{employee.fullName}</strong>
        </div>
        <div>
          <span>اسم المستخدم</span>
          <strong dir="ltr">@{employee.username}</strong>
        </div>
      </div>

      <div className="receipt-customer">
        <div className="receipt-customer-row">
          <span>التاريخ:</span>
          <strong>{formatDualDate(day.date, 'ar')}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>وقت الطباعة:</span>
          <strong dir="ltr">{printedAt}</strong>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>الوردية</th>
            <th>الطلبات</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {day.shifts.map((shift, idx) => (
            <tr key={shift.id}>
              <td>
                <div dir="ltr">
                  #{idx + 1} ({formatCairoTime(shift.startedAt)} -{' '}
                  {shift.status === 'active' ? 'نشطة' : formatCairoTime(shift.endedAt)})
                </div>
                {shift.notes && (
                  <div style={{ fontSize: '9px', opacity: 0.85 }}>{shift.notes}</div>
                )}
              </td>
              <td>{shift.deliveredOrdersCount}</td>
              <td>{formatCurrency(shift.deliveredRevenue, 'ar')}</td>
            </tr>
          ))}
          {day.offShiftOrdersCount > 0 && (
            <tr>
              <td>تسليمات خارج الوردية</td>
              <td>{day.offShiftOrdersCount}</td>
              <td>{formatCurrency(day.offShiftRevenue, 'ar')}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="receipt-financials">
        <div className="receipt-customer-row">
          <span>كاش / نقداً:</span>
          <strong>{formatCurrency(day.paymentBreakdown.cash, 'ar')}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>إنستاباي (InstaPay):</span>
          <strong>{formatCurrency(day.paymentBreakdown.instapay, 'ar')}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>فودافون كاش:</span>
          <strong>{formatCurrency(day.paymentBreakdown.vodafone_cash, 'ar')}</strong>
        </div>
        <div className="receipt-customer-row">
          <span>فيزا / بطاقة:</span>
          <strong>{formatCurrency(day.paymentBreakdown.card, 'ar')}</strong>
        </div>
      </div>

      <div className="receipt-total">
        <span>إجمالي الإيراد المسلّم ({day.deliveredOrdersCount} طلب):</span>
        <strong>{formatCurrency(day.deliveredRevenue, 'ar')}</strong>
      </div>

      <div className="receipt-customer" style={{ marginTop: '10px', borderTop: '1px dashed #000', paddingTop: '8px' }}>
        <div className="receipt-customer-row">
          <span>توقيع الموظف:</span>
          <span>________________</span>
        </div>
        <div className="receipt-customer-row" style={{ marginTop: '6px' }}>
          <span>توقيع الإدارة:</span>
          <span>________________</span>
        </div>
      </div>

      <p className="receipt-footer">حلويات فتوح — تقرير ورديات الموظفين</p>
    </article>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(content, document.body);
}

export default PrintableEmployeeDailyReport;
