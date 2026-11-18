export interface ZaloStickerItem {
  code: string;
  emoji: string;
  label: string;
  gradient: readonly [string, string];
  accent: string;
}

export const ZALO_STICKERS: ZaloStickerItem[] = [
  {
    code: 'zalo-hello',
    emoji: '👋😊',
    label: 'Xin chào!',
    gradient: ['#E3F2FD', '#BBDEFB'],
    accent: '#0D47A1',
  },
  {
    code: 'zalo-love',
    emoji: '🥰❤️',
    label: 'Thả tim nè',
    gradient: ['#FCE4EC', '#F8BBD0'],
    accent: '#AD1457',
  },
  {
    code: 'zalo-haha',
    emoji: '🤣😂',
    label: 'Cười xỉu!',
    gradient: ['#FFF8E1', '#FFECB3'],
    accent: '#E65100',
  },
  {
    code: 'zalo-cheer',
    emoji: '🎉🥳',
    label: 'Chúc mừng!',
    gradient: ['#F3E5F5', '#E1BEE7'],
    accent: '#6A1B9A',
  },
  {
    code: 'zalo-ok',
    emoji: '👌✨',
    label: 'OK chốt nhé!',
    gradient: ['#E8F5E9', '#C8E6C9'],
    accent: '#1B5E20',
  },
  {
    code: 'zalo-thanks',
    emoji: '🙏💖',
    label: 'Cảm ơn nhiều!',
    gradient: ['#FFF3E0', '#FFE0B2'],
    accent: '#BF360C',
  },
  {
    code: 'zalo-fighting',
    emoji: '💪🔥',
    label: 'Cố lên nào!',
    gradient: ['#FFEBEE', '#FFCDD2'],
    accent: '#B71C1C',
  },
  {
    code: 'zalo-wow',
    emoji: '😮🌟',
    label: 'Đỉnh quá!',
    gradient: ['#E0F7FA', '#B2EBF2'],
    accent: '#006064',
  },
  {
    code: 'zalo-sad',
    emoji: '🥺💧',
    label: 'Buồn ghê...',
    gradient: ['#ECEFF1', '#CFD8DC'],
    accent: '#37474F',
  },
  {
    code: 'zalo-coding',
    emoji: '💻🚀',
    label: 'Đang chạy deadline',
    gradient: ['#E8EAF6', '#C5CAE9'],
    accent: '#283593',
  },
  {
    code: 'zalo-coffee',
    emoji: '☕🥐',
    label: 'Cà phê nhé!',
    gradient: ['#EFEBE9', '#D7CCC8'],
    accent: '#4E342E',
  },
  {
    code: 'zalo-like',
    emoji: '👍💯',
    label: 'Quá chuẩn!',
    gradient: ['#E1F5FE', '#B3E5FC'],
    accent: '#01579B',
  },
];

export const QUICK_EMOJIS = [
  '😀',
  '😂',
  '🥰',
  '😎',
  '🤔',
  '😮',
  '😢',
  '😡',
  '👍',
  '❤️',
  '🎉',
  '🔥',
  '🙏',
  '💯',
  '✅',
  '🚀',
];

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🙏'];

export const findStickerByCode = (
  code?: string | null,
): ZaloStickerItem | undefined =>
  code ? ZALO_STICKERS.find((item) => item.code === code) : undefined;
