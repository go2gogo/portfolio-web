import { useState } from "react";
import type { Stock, Price } from "../types";
import { formatSigned } from "../lib/format";

// ─── 공용: 오늘 손익 계산 ─────────────────────────────────────
export interface TodayPnLRow {
  ticker: string;
  name: string;
  amount: number;
}
export interface TodayPnLData {
  winners: TodayPnLRow[];
  losers: TodayPnLRow[];
  winSum: number;
  loseSum: number;
}

export function computeTodayPnL(
  holdings: Stock[],
  prices: Map<string, Price>,
): TodayPnLData {
  const winners: TodayPnLRow[] = [];
  const losers: TodayPnLRow[] = [];
  for (const s of holdings) {
    if (s.shares <= 0) continue;
    const p = prices.get(s.ticker);
    if (!p || p.base <= 0) continue;
    const amount = (p.price - p.base) * s.shares;
    if (amount === 0) continue;
    const row: TodayPnLRow = {
      ticker: s.ticker,
      name: s.name || s.ticker,
      amount,
    };
    if (amount > 0) winners.push(row);
    else losers.push(row);
  }
  winners.sort((a, b) => b.amount - a.amount);
  losers.sort((a, b) => a.amount - b.amount);
  return {
    winners,
    losers,
    winSum: winners.reduce((acc, r) => acc + r.amount, 0),
    loseSum: losers.reduce((acc, r) => acc + r.amount, 0),
  };
}

interface Props {
  holdings: Stock[];
  prices: Map<string, Price>;
}

// ─── 데스크톱: 두 미니 테이블 — 항상 헤더+총액 표시, 클릭 시 행 펼침 ──
export function TodayPnLTable({ holdings, prices }: Props) {
  const [open, setOpen] = useState(false);
  const { winners, losers, winSum, loseSum } = computeTodayPnL(holdings, prices);
  if (winners.length === 0 && losers.length === 0) return null;

  const toggle = () => setOpen(o => !o);

  return (
    <div className="flex gap-2 text-xs">
      <MiniTable
        title="오늘 수익"
        rows={winners}
        total={winSum}
        colorClass="text-rose-600"
        headerBg="bg-rose-50"
        open={open}
        onToggle={toggle}
      />
      <MiniTable
        title="오늘 손해"
        rows={losers}
        total={loseSum}
        colorClass="text-blue-600"
        headerBg="bg-blue-50"
        open={open}
        onToggle={toggle}
      />
    </div>
  );
}

interface MiniProps {
  title: string;
  rows: TodayPnLRow[];
  total: number;
  colorClass: string;
  headerBg: string;
  open: boolean;
  onToggle: () => void;
}

function MiniTable({
  title, rows, total, colorClass, headerBg, open, onToggle,
}: MiniProps) {
  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-md
                    overflow-hidden w-[200px] flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        title={open ? "닫기" : "펼치기"}
        className={`px-2 py-1 ${headerBg} ${colorClass} font-semibold
                    text-[11px] border-b border-gray-200 flex justify-between
                    items-center cursor-pointer hover:brightness-95`}>
        <span>{title}</span>
        <span className="text-gray-400 text-[10px] leading-none">
          {open ? "▼" : "▲"}
        </span>
      </button>
      {open && (
        rows.length === 0 ? (
          <div className="px-2 py-2 text-gray-400 text-[11px]">없음</div>
        ) : (
          <div className="max-h-[200px] overflow-y-auto">
            <table className="w-full tabular-nums">
              <tbody>
                {rows.map(r => (
                  <tr key={r.ticker} className="border-b border-gray-100 last:border-0">
                    <td className="px-2 py-0.5 truncate max-w-[110px] text-gray-700">
                      {r.name}
                    </td>
                    <td className={`px-2 py-0.5 text-right font-medium ${colorClass}`}>
                      {formatSigned(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <div className="px-2 py-1 border-t border-gray-300 bg-gray-50
                      flex justify-between items-baseline">
        <span className="text-gray-500 text-[11px]">총액</span>
        <span className={`font-bold ${colorClass} tabular-nums`}>
          {formatSigned(total)}원
        </span>
      </div>
    </div>
  );
}

// ─── 모바일: TotalRow 위로 떠오르는 레이어 (수익/손해 가로 2열) ─────
export function MobileTodayPnLLayer({ holdings, prices }: Props) {
  const { winners, losers, winSum, loseSum } = computeTodayPnL(holdings, prices);
  if (winners.length === 0 && losers.length === 0) return null;

  return (
    <div className="flex gap-2 w-[calc(100vw-1.5rem)] max-w-[420px]">
      <MobileSection
        title="오늘 수익"
        rows={winners}
        total={winSum}
        colorClass="text-rose-600"
        headerBg="bg-rose-50"
      />
      <MobileSection
        title="오늘 손해"
        rows={losers}
        total={loseSum}
        colorClass="text-blue-600"
        headerBg="bg-blue-50"
      />
    </div>
  );
}

interface MobileSectionProps {
  title: string;
  rows: TodayPnLRow[];
  total: number;
  colorClass: string;
  headerBg: string;
}

function MobileSection({
  title, rows, total, colorClass, headerBg,
}: MobileSectionProps) {
  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-md
                    overflow-hidden flex flex-col flex-1 min-w-0">
      <div className={`px-2 py-1 ${headerBg} ${colorClass} font-semibold
                        text-xs border-b border-gray-200`}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-2 py-2 text-gray-400 text-xs">없음</div>
      ) : (
        <div className="max-h-[28vh] overflow-y-auto">
          <table className="w-full tabular-nums text-xs">
            <tbody>
              {rows.map(r => (
                <tr key={r.ticker} className="border-b border-gray-100 last:border-0">
                  <td className="px-2 py-1 truncate text-gray-700">{r.name}</td>
                  <td className={`px-2 py-1 text-right font-medium ${colorClass}`}>
                    {formatSigned(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-2 py-1 border-t border-gray-300 bg-gray-50
                      flex justify-between items-baseline">
        <span className="text-gray-500 text-xs">총액</span>
        <span className={`font-bold text-sm ${colorClass} tabular-nums`}>
          {formatSigned(total)}원
        </span>
      </div>
    </div>
  );
}
