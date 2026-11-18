export interface ZaloStickerItem {
  code: string;
  emoji: string;
  label: string;
  bg: string;
  accent: string;
}

export const ZALO_STICKERS: ZaloStickerItem[] = [
  {
    code: "zalo-hello",
    emoji: "👋😊",
    label: "Xin chào!",
    bg: "linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)",
    accent: "#0d47a1",
  },
  {
    code: "zalo-love",
    emoji: "🥰❤️",
    label: "Thả tim nè",
    bg: "linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)",
    accent: "#ad1457",
  },
  {
    code: "zalo-haha",
    emoji: "🤣😂",
    label: "Cười xỉu!",
    bg: "linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)",
    accent: "#e65100",
  },
  {
    code: "zalo-cheer",
    emoji: "🎉🥳",
    label: "Chúc mừng!",
    bg: "linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)",
    accent: "#6a1b9a",
  },
  {
    code: "zalo-ok",
    emoji: "👌✨",
    label: "OK chốt nhé!",
    bg: "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)",
    accent: "#1b5e20",
  },
  {
    code: "zalo-thanks",
    emoji: "🙏💖",
    label: "Cảm ơn nhiều!",
    bg: "linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)",
    accent: "#bf360c",
  },
  {
    code: "zalo-fighting",
    emoji: "💪🔥",
    label: "Cố lên nào!",
    bg: "linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)",
    accent: "#b71c1c",
  },
  {
    code: "zalo-wow",
    emoji: "😮🌟",
    label: "Đỉnh quá!",
    bg: "linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)",
    accent: "#006064",
  },
  {
    code: "zalo-sad",
    emoji: "🥺💧",
    label: "Buồn ghê...",
    bg: "linear-gradient(135deg, #eceff1 0%, #cfd8dc 100%)",
    accent: "#37474f",
  },
  {
    code: "zalo-coding",
    emoji: "💻🚀",
    label: "Đang chạy deadline",
    bg: "linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%)",
    accent: "#283593",
  },
  {
    code: "zalo-coffee",
    emoji: "☕🥐",
    label: "Cà phê nhé!",
    bg: "linear-gradient(135deg, #efebe9 0%, #d7ccc8 100%)",
    accent: "#4e342e",
  },
  {
    code: "zalo-like",
    emoji: "👍💯",
    label: "Quá chuẩn!",
    bg: "linear-gradient(135deg, #e1f5fe 0%, #b3e5fc 100%)",
    accent: "#01579b",
  },
];

export const QUICK_EMOJIS = [
  "😀",
  "😂",
  "🥰",
  "😎",
  "🤔",
  "😮",
  "😢",
  "😡",
  "👍",
  "❤️",
  "🎉",
  "🔥",
  "🙏",
  "💯",
  "✅",
  "🚀",
];

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🎉", "🙏"];

export const findStickerByCode = (code?: string | null): ZaloStickerItem | undefined =>
  code ? ZALO_STICKERS.find((item) => item.code === code) : undefined;
