import type { Stock, Price } from "../types";
import { formatSigned, signColor } from "../lib/format";

interface Props {
  holdings: Stock[];
  prices: Map<string, Price>;
}

// 합계는 매도 수수료 미적용 (raw 가격 × 주수). 데스크톱 v2 와 동일.
// 카드 개별 "전체수익" 은 FEE 적용 (매도 시 실수령액 추정) — 의도적 비대칭.
// 장마감 종목도 종가 vs 어제 종가 차이로 합계에 정상 반영 (다음 장 시작 전까지 유효).

export function TotalRow({ holdings, prices }: Props) {
  let totalInvested = 0;
  let totalCurrent = 0;
  let totalYesterday = 0;
  let activeCount = 0;

  for (const s of holdings) {
    if (s.shares <= 0) continue;
    const p = prices.get(s.ticker);
    if (!p) continue;
    const cur = p.price || s.avg_price;
    const base = p.base || cur;
    totalInvested += s.shares * s.avg_price;
    totalCurrent += cur * s.shares;
    totalYesterday += base * s.shares;
    activeCount++;
  }

  if (activeCount === 0) return null;

  const pnl = totalCurrent - totalInvested;
  const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
  const dayDiff = totalCurrent - totalYesterday;
  const dayPct = totalYesterday > 0 ? (dayDiff / totalYesterday) * 100 : 0;

  const totalColor = signColor(pnl) || "text-rose-700";

  return (
    <div className="w-fit bg-white border border-gray-300
                     rounded-lg shadow-md px-5 py-3
                     grid grid-cols-[auto_auto_auto_auto]
                     gap-x-3 gap-y-1 items-baseline
                     text-sm leading-tight whitespace-nowrap">
      {/* Row 1: 원금  |  전체 */}
      <div className="text-gray-500 text-xs">원금</div>
      <div className="text-right text-gray-800">
        {totalInvested.toLocaleString()}원
      </div>
      <div className="text-gray-500 text-xs pl-2">전체</div>
      <div className={`text-right font-bold ${signColor(pnl)}`}>
        {formatSigned(pnl)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
      </div>

      {/* Row 2: 현재 (큰 빨강/파랑)  |  오늘 */}
      <div className="text-gray-500 text-xs">현재</div>
      <div className={`text-right font-bold text-xl ${totalColor}`}>
        {totalCurrent.toLocaleString()}원
      </div>
      <div className="text-gray-500 text-xs pl-2">오늘</div>
      <div className={`text-right font-bold ${signColor(dayDiff)}`}>
        {formatSigned(dayDiff)} ({dayPct >= 0 ? "+" : ""}{dayPct.toFixed(2)}%)
      </div>
    </div>
  );
}
