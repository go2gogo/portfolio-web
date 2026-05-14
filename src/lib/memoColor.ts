import type { MemoColor } from "../types";

// 색상 라벨 옵션 (다이얼로그 팔레트용)
export const MEMO_COLORS: readonly MemoColor[] = [
  "red", "yellow", "green", "blue", "purple", "gray",
] as const;

// 표시용 한글 라벨 — tooltip 등에 사용
const COLOR_LABEL: Record<MemoColor, string> = {
  red: "빨강",
  yellow: "노랑",
  green: "초록",
  blue: "파랑",
  purple: "보라",
  gray: "회색",
};

export function memoColorLabel(c?: MemoColor): string {
  return c ? COLOR_LABEL[c] : "없음";
}

// 아이콘/태그 텍스트 색상 (메모 있는 종목 강조용)
// 메모는 있지만 color 미지정 → sky 기본 (메모 있다는 것 자체를 시각적으로 표시)
export function memoIconClass(c?: MemoColor): string {
  switch (c) {
    case "red":    return "text-rose-500";
    case "yellow": return "text-amber-500";
    case "green":  return "text-emerald-500";
    case "blue":   return "text-sky-500";
    case "purple": return "text-violet-500";
    case "gray":   return "text-slate-500";
    default:       return "text-sky-500";
  }
}

// 메모 없을 때 (진입점 아이콘 — 옅은 회색)
export const memoIconIdleClass = "text-slate-300 hover:text-slate-500";

// 태그 칩 배경 (색상 라벨 적용 시)
export function memoTagClass(c?: MemoColor): string {
  switch (c) {
    case "red":    return "bg-rose-50 text-rose-700 border border-rose-200";
    case "yellow": return "bg-amber-50 text-amber-700 border border-amber-200";
    case "green":  return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "blue":   return "bg-sky-50 text-sky-700 border border-sky-200";
    case "purple": return "bg-violet-50 text-violet-700 border border-violet-200";
    case "gray":   return "bg-slate-50 text-slate-700 border border-slate-200";
    default:       return "bg-slate-50 text-slate-600 border border-slate-200";
  }
}

// 다이얼로그 색상 선택 버튼 — swatch 배경
export function memoSwatchClass(c: MemoColor): string {
  switch (c) {
    case "red":    return "bg-rose-400";
    case "yellow": return "bg-amber-400";
    case "green":  return "bg-emerald-400";
    case "blue":   return "bg-sky-400";
    case "purple": return "bg-violet-400";
    case "gray":   return "bg-slate-400";
  }
}

// 다이얼로그 색상 선택 버튼 — 선택 상태 ring
export function memoSwatchRingClass(c: MemoColor): string {
  switch (c) {
    case "red":    return "ring-rose-400";
    case "yellow": return "ring-amber-400";
    case "green":  return "ring-emerald-400";
    case "blue":   return "ring-sky-400";
    case "purple": return "ring-violet-400";
    case "gray":   return "ring-slate-400";
  }
}
