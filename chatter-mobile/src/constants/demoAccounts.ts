export interface DemoAccountItem {
  label: string;
  roleBadge: string;
  email: string;
  password: string;
}

export const DEMO_ACCOUNTS: DemoAccountItem[] = [
  {
    label: 'Nguyễn Minh',
    roleBadge: 'Chủ nhóm',
    email: 'minh.nguyen@chatter.vn',
    password: 'Password@123',
  },
  {
    label: 'Trần Thị Lan',
    roleBadge: 'Admin nhóm',
    email: 'lan.tran@chatter.vn',
    password: 'Password@123',
  },
  {
    label: 'Lê Quốc Huy',
    roleBadge: 'Thành viên',
    email: 'huy.le@chatter.vn',
    password: 'Password@123',
  },
  {
    label: 'System Admin',
    roleBadge: 'Quản trị HT',
    email: 'admin@chatter.vn',
    password: 'Admin@123456',
  },
];
