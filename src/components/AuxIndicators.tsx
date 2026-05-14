// 카드 통계 박스 보조 지표 (PC/모바일 공용)
// — 3개월 등락률 / 변동성 / 외인비율 추세
// — 거래일엔 접힘 (default), 비거래일엔 펼침. 클릭으로 토글.
// — 통계 박스 우측 하단에 별도 네모 블럭으로 표시
// — 부모 박스에 `relative` 클래스 필요

import { useEffect, useState, type ReactElement } from "react";
import type { Investor } from "../types";
import { signColor } from "../lib/format";

function fmtShares(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(1)}천만`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000)}만`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs}`;
}

interface Props {
  chart?: number[];
  investorHistory?: Investor[] | null;
  isTradingDay: boolean;
  textSize?: "xs" | "10";    // PC: xs (11px), 모바일: 10 (10px)
  defaultOpen?: boolean;     // true 면 항상 펼친 상태로 시작 (관심종목 등 우측 패널 빈 경우)
}

export function AuxIndicators({
  chart, investorHistory, isTradingDay, textSize = "xs", defaultOpen,
}: Props) {
  const [expanded, setExpanded] = useState(defaultOpen ?? !isTradingDay);
  const sizeCls = textSize === "10" ? "text-[10px]" : "text-[11px]";

  // 외부 일괄 토글 이벤트 — 닫기 / 열기
  useEffect(() => {
    const onClose = () => setExpanded(false);
    const onOpen = () => setExpanded(true);
    window.addEventListener("aux:closeAll", onClose);
    window.addEventListener("aux:openAll", onOpen);
    return () => {
      window.removeEventListener("aux:closeAll", onClose);
      window.removeEventListener("aux:openAll", onOpen);
    };
  }, []);

  const lines: ReactElement[] = [];

  if (chart && chart.length >= 2) {
    const first = chart[0];
    const last = chart[chart.length - 1];
    if (first > 0) {
      const pct = ((last - first) / first) * 100;
      lines.push(
        <div key="m3" className={`${sizeCls} leading-tight`}>
          <span className="text-gray-500">3개월 </span>
          <span className={`font-medium ${signColor(pct)}`}>
            {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
          </span>
        </div>
      );
    }

    const returns: number[] = [];
    for (let i = 1; i < chart.length; i++) {
      const p = chart[i - 1];
      if (p > 0) returns.push(((chart[i] - p) / p) * 100);
    }
    if (returns.length >= 5) {
      const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
      const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
      const vol = Math.sqrt(variance);
      lines.push(
        <div key="vol" className={`${sizeCls} leading-tight`}>
          <span className="text-gray-500">변동성 </span>
          <span className="text-gray-700 font-medium">
            ±{vol.toFixed(2)}%/일
          </span>
        </div>
      );
    }
  }

  if (investorHistory && investorHistory.length >= 2) {
    const days = investorHistory.length;

    // 외국인 60일 누적 순매수 (주)
    const foreignerSum = investorHistory.reduce((s, inv) => s + (inv.외국인 ?? 0), 0);
    if (foreignerSum !== 0) {
      lines.push(
        <div key="foreigner" className={`${sizeCls} leading-tight`}>
          <span className="text-gray-500">외국인 ({days}일) </span>
          <span className={`font-medium ${signColor(foreignerSum)}`}>
            {fmtShares(foreignerSum)}
          </span>
        </div>
      );
    }

    // 기관 60일 누적 순매수 (주)
    const instSum = investorHistory.reduce((s, inv) => s + (inv.기관 ?? 0), 0);
    if (instSum !== 0) {
      lines.push(
        <div key="inst" className={`${sizeCls} leading-tight`}>
          <span className="text-gray-500">기관 ({days}일) </span>
          <span className={`font-medium ${signColor(instSum)}`}>
            {fmtShares(instSum)}
          </span>
        </div>
      );
    }

    // 연기금 60일 누적 순매수 (주)
    const pensionSum = investorHistory.reduce((s, inv) => s + (inv.연기금 ?? 0), 0);
    if (pensionSum !== 0) {
      lines.push(
        <div key="pension" className={`${sizeCls} leading-tight`}>
          <span className="text-gray-500">연기금 ({days}일) </span>
          <span className={`font-medium ${signColor(pensionSum)}`}>
            {fmtShares(pensionSum)}
          </span>
        </div>
      );
    }
  }

  if (lines.length === 0) return null;

  // 우측 하단 별도 네모 블럭
  return (
    <div className="absolute bottom-1 right-1 z-10">
      {expanded ? (
        <div onClick={() => setExpanded(false)}
             title="클릭해 접기"
             className="border border-gray-300 rounded bg-white/95 px-1.5 py-0.5
                        shadow-sm cursor-pointer hover:bg-gray-50">
          <div className="space-y-0">
            {lines}
          </div>
        </div>
      ) : (
        <button type="button"
                onClick={() => setExpanded(true)}
                title={`추가지표 (${lines.length}개) 펼치기`}
                className="border border-gray-300 rounded bg-white/95 px-1.5 py-0.5
                           text-[8px] text-gray-500 hover:text-gray-700 shadow-sm
                           cursor-pointer leading-none">
          ▲
        </button>
      )}
    </div>
  );
}
