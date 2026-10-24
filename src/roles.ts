import type {Role} from './types';

export const staffRoles: readonly Role[] = ['Owner','Manager','Cashier','Waiter','Kitchen','HQ Admin'];

const roleLabels: Record<Role | 'Customer', string> = {
  Owner: 'เจ้าของร้าน',
  Manager: 'ผู้จัดการร้าน',
  Cashier: 'แคชเชียร์',
  Waiter: 'พนักงานเสิร์ฟ',
  Kitchen: 'พนักงานครัว',
  'HQ Admin': 'ผู้ดูแลสำนักงานใหญ่',
  Customer: 'ลูกค้า',
};

export function roleLabel(role: string): string {
  return roleLabels[role as keyof typeof roleLabels] || role;
}

export function auditDetailLabel(action: string, detail: string): string {
  if(action !== 'เปลี่ยนสิทธิ์') return detail;
  return detail.replace(/(→\s*)(Owner|Manager|Cashier|Waiter|Kitchen|HQ Admin)$/, (_, arrow: string, role: string) => arrow + roleLabel(role));
}
