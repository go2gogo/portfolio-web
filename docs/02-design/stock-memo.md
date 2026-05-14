# Design: 종목별 메모 (stock-memo)

> Plan 참조: `docs/01-plan/stock-memo.md`

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer                                                   │
│  ┌──────────────────┐    ┌────────────────────────────┐    │
│  │ StockCard        │───▶│ MemoDialog (신규)          │    │
│  │ MobileStockCard  │    │ 텍스트/목표가/손절가/태그/색 │    │
│  │  + memo 인디케이터│    └──────────┬─────────────────┘    │
│  └──────────────────┘                │                      │
└──────────────────────────────────────┼──────────────────────┘
                                       │ upsertMemo/deleteMemo
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Data Layer                                                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │ db.ts (Dexie v2)                                   │    │
│  │   memos 테이블 (PK: ticker)                        │    │
│  │   exportAll() ─▶ payload.memos[] 포함             │    │
│  └─────────────────────┬──────────────────────────────┘    │
│                        │ scheduleAutoSync()                 │
└────────────────────────┼────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Sync Layer                                                 │
│  syncManager.ts                                             │
│   normalize()        ─▶ memos 도 결정적 직렬화 (필수)       │
│   downloadFromDrive  ─▶ replaceAllMemos(data.memos ?? [])  │
└─────────────────────────────────────────────────────────────┘
                         ▼
                  portfolio.json (Drive appdata)
                  { holdings, peaks, memos, settings, exported_at }
```

## 2. 타입 정의

### 2.1 Memo 인터페이스 (`src/types.ts`)

```ts
export type MemoColor = "red" | "yellow" | "green" | "blue" | "purple" | "gray";

export interface Memo {
  ticker: string;            // PK — 종목 코드 (계좌 무관)
  text?: string;             // 자유 텍스트 (최대 2000자)
  targetPrice?: number;      // 목표가 (양수)
  stopPrice?: number;        // 손절가 (양수)
  tag?: string;              // 짧은 라벨 (최대 12자)
  color?: MemoColor;         // 색상 라벨
  updatedAt: string;         // ISO 8601
}
```

**의도**:
- `ticker` 만 PK — 같은 종목을 여러 그룹에 등록해도 메모는 1개 공유
- 모든 콘텐츠 필드는 optional — 빈 메모는 자동 삭제(아래 §5.2)
- `updatedAt` 은 향후 충돌 해결 확장 여지 (현재는 표시만)

### 2.2 ExportPayload 확장 (`src/lib/db.ts`)

```ts
export interface ExportPayload {
  holdings: Stock[];
  peaks: Record<string, number>;
  memos?: Memo[];            // 신규 — optional (구버전 호환)
  exported_at: string;
  settings?: { independentGroups?: boolean };
}
```

## 3. DB 레이어 변경

### 3.1 Dexie 스키마 마이그레이션

```ts
class PortfolioDB extends Dexie {
  holdings!: Table<Stock, string>;
  peaks!: Table<Peak, string>;
  config!: Table<ConfigKV, string>;
  memos!: Table<Memo, string>;       // 추가

  constructor() {
    super("portfolio_v3");
    // 기존 v1 — 그대로 유지 (기존 사용자 데이터 보존)
    this.version(1).stores({
      holdings: "&id, ticker, account",
      peaks: "&ticker",
      config: "&key",
    });
    // v2 — memos 테이블 추가만 (기존 테이블 건드리지 않음)
    this.version(2).stores({
      holdings: "&id, ticker, account",
      peaks: "&ticker",
      config: "&key",
      memos: "&ticker",
    });
  }
}
```

**주의**: 기존 `portfolio_v3` DB 이름 유지. Dexie 가 v1→v2 자동 마이그레이션 처리.

### 3.2 CRUD 함수 시그니처

```ts
// 단건 조회 — 없으면 undefined
export async function getMemo(ticker: string): Promise<Memo | undefined>;

// 전체 조회 — Map<ticker, Memo> 로 반환 (StockCard 에서 O(1) 조회용)
export async function loadMemos(): Promise<Map<string, Memo>>;

// upsert — 모든 콘텐츠 필드가 빈 값이면 자동 삭제 (deleteMemo 호출)
// updatedAt 은 함수 내부에서 new Date().toISOString() 으로 자동 설정
export async function upsertMemo(
  memo: Omit<Memo, "updatedAt">
): Promise<"saved" | "deleted">;

// 단건 삭제
export async function deleteMemo(ticker: string): Promise<void>;

// 다운로드 복원용 — 전체 교체 (Drive sync 와 동일 패턴)
export async function replaceAllMemos(memos: Memo[]): Promise<void>;
```

### 3.3 exportAll 변경

```ts
export async function exportAll(): Promise<ExportPayload> {
  const [stocks, peaks, memos] = await Promise.all([
    loadHoldings(),
    loadPeaks(),
    loadMemos(),
  ]);
  // ... 기존 cleanHoldings, peaksObj ...

  const memosList: Memo[] = Array.from(memos.values())
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    holdings: cleanHoldings,
    peaks: peaksObj,
    memos: memosList,        // 신규
    exported_at: new Date().toISOString(),
    settings: { independentGroups },
  };
}
```

## 4. Sync 레이어 변경 (`syncManager.ts`)

### 4.1 `normalize()` — 가장 중요한 변경

```ts
function normalize(p: ExportPayload): string {
  const holdings = /* 기존과 동일 */;
  const peakKeys = Object.keys(p.peaks ?? {}).sort();
  const peaks: Record<string, number> = {};
  for (const k of peakKeys) peaks[k] = p.peaks[k];

  // 신규 — memos 도 정규화 대상에 포함
  const memos = [...(p.memos ?? [])]
    .map(m => ({
      ticker: m.ticker,
      text: m.text ?? "",
      targetPrice: m.targetPrice ?? null,
      stopPrice: m.stopPrice ?? null,
      tag: m.tag ?? "",
      color: m.color ?? "",
      // updatedAt 은 정규화에서 제외 — 내용 동일성 비교용
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  return JSON.stringify({ holdings, peaks, memos });
}
```

**왜 필수인가**: 메모만 변경한 후 자동 sync 가 일어났을 때, 이 함수가 memos 를 비교하지
않으면 "내용 동일"로 판정되어 업로드가 silent skip 됨. 다기기 동기화 실패의 원인이 됨.

### 4.2 `downloadFromDrive()` 확장

```ts
export async function downloadFromDrive(): Promise<boolean> {
  const result = await downloadFile<ExportPayload>();
  if (!result) return false;
  const { data, modifiedTime } = result;
  if (data.holdings) await replaceAllHoldings(data.holdings);
  if (data.peaks) await replaceAllPeaks(data.peaks);
  await replaceAllMemos(data.memos ?? []);   // 신규 — undefined 면 빈 배열
  applyImportedSettings(data.settings);
  setLastSynced(modifiedTime);
  suppressNextAutoSync = true;
  return true;
}
```

**호환성 보장**: 구버전 portfolio.json 에 `memos` 필드가 없어도 `?? []` 로 빈 배열 처리.

## 5. UI 컴포넌트 설계

### 5.1 MemoDialog (신규 — `src/components/MemoDialog.tsx`)

**Props**:
```ts
interface Props {
  isOpen: boolean;
  onClose: () => void;
  ticker: string;
  stockName: string;       // 다이얼로그 타이틀용
  curPrice?: number;       // 목표가/손절가 도달 거리 미리보기
  onChanged: () => void;   // 상위 상태 새로고침 트리거
}
```

**레이아웃** (모달, EditHoldingDialog 패턴 따름):

```
┌────────────────────────────────────────────┐
│ 메모 — 삼성전자 (005930)            [×]    │
├────────────────────────────────────────────┤
│ 색상 라벨                                   │
│  ⚪ 🔴 🟡 🟢 🔵 🟣 ⚫  (없음/red/yel/grn/blu/pur/gry) │
│                                            │
│ 태그 (선택)                                 │
│  [_____________] (최대 12자)               │
│                                            │
│ 목표가      현재가 78,500                  │
│  [_____] 원   ▲ +3.2% 시 도달            │
│                                            │
│ 손절가                                      │
│  [_____] 원   ▼ -5.1% 시 도달            │
│                                            │
│ 메모                                        │
│  ┌──────────────────────────────────────┐ │
│  │                                       │ │
│  │  (자유 텍스트, 최대 2000자)           │ │
│  │                                       │ │
│  └──────────────────────────────────────┘ │
│                              1234 / 2000  │
├────────────────────────────────────────────┤
│  [삭제]              [취소]     [저장]    │
└────────────────────────────────────────────┘
```

**검증 규칙**:
- `targetPrice`, `stopPrice`: 빈 값 허용, 입력 시 양수 + 천단위 콤마 자동 처리
- `tag`: trim 후 12자 초과 시 자동 절단 (입력 시 maxLength)
- `text`: 2000자 초과 시 입력 차단
- 모든 콘텐츠 필드가 비어있으면 [저장] = [삭제] 로 동작 (자동 cleanup)

**저장 흐름**:
1. `upsertMemo({ ticker, text, targetPrice, stopPrice, tag, color })`
2. `scheduleAutoSync()` — 자동 sync ON 일 때만 동작
3. `onChanged()` 콜백 → 상위에서 `loadMemos()` 재호출

### 5.2 빈 메모 자동 정리

`upsertMemo` 내부에서:
```ts
const isEmpty = !memo.text?.trim()
              && memo.targetPrice == null
              && memo.stopPrice == null
              && !memo.tag?.trim()
              && !memo.color;
if (isEmpty) {
  await deleteMemo(memo.ticker);
  return "deleted";
}
```

이유: "메모 다 지웠지만 빈 레코드가 남는" 상태를 방지 → Drive payload 도 깔끔.

### 5.3 StockCard / MobileStockCard 통합

**추가 prop**:
```ts
interface Props {
  // ...기존
  memo?: Memo;                              // 상위에서 주입
  onOpenMemo?: (ticker: string) => void;   // 메모 아이콘 클릭 핸들러
}
```

**시각적 표현**:

1. **메모 진입점 아이콘** (카드 우측 상단, 기존 도구 아이콘 옆):
   - 메모 없음: `StickyNote` 아이콘 (회색, 작음)
   - 메모 있음: 아이콘 색상이 `memo.color` 로 강조 (없으면 푸른색)
   - 클릭 → `onOpenMemo(ticker)`

2. **태그 칩** (카드 본문 종목명 아래, 있을 때만):
   ```
   삼성전자  [장기보유]   ← 색상 라벨 적용된 작은 칩
   ```

3. **목표가/손절가 도달 인디케이터** (가격 우측):
   - 현재가 ≥ `targetPrice`: `▲ 목표` (초록 작은 라벨)
   - 현재가 ≤ `stopPrice`: `▼ 손절` (빨강 작은 라벨)
   - 도달 거리 ±2% 이내: 점선 깜빡임 없는 정적 표시 (산만 X)

### 5.4 상위 컨테이너 (App.tsx 또는 그룹 뷰)

상위에서 메모 Map 을 한 번에 로드해서 props 로 전달:
```ts
const [memos, setMemos] = useState<Map<string, Memo>>(new Map());

useEffect(() => { loadMemos().then(setMemos); }, []);

const reloadMemos = () => loadMemos().then(setMemos);

// MemoDialog 의 onChanged → reloadMemos
```

이미 holdings 를 비슷하게 관리하므로 동일 패턴 차용.

## 6. 색상 팔레트 (Tailwind 토큰)

`MemoColor` → Tailwind 클래스 매핑은 별도 헬퍼 `src/lib/memoColor.ts`:

| Color | Icon/Tag tint | Border (다이얼로그 선택 표시) |
|---|---|---|
| `red` | `text-rose-500` | `ring-rose-400` |
| `yellow` | `text-amber-500` | `ring-amber-400` |
| `green` | `text-emerald-500` | `ring-emerald-400` |
| `blue` | `text-sky-500` | `ring-sky-400` |
| `purple` | `text-violet-500` | `ring-violet-400` |
| `gray` | `text-slate-500` | `ring-slate-400` |
| `undefined` | `text-slate-400` (기본) | — |

다크모드는 기존 카드 색 패턴 따름 (기존 `signColor` 와 충돌 없음).

## 7. 엣지 케이스

| # | 케이스 | 처리 |
|---|---|---|
| E1 | 종목 삭제 시 메모 잔존 | `deleteAllRowsForTicker` 호출 시 같이 `deleteMemo` 호출 (또는 그대로 두고 다음 sync 에 살리는 옵션 — 후자 권장: 잘못 삭제 시 복구) |
| E2 | 구버전 클라이언트가 신버전 payload 로드 | `data.memos` 무시 → holdings/peaks 만 적용. 데이터 손실 없음 |
| E3 | 다기기 동시 메모 편집 | 기존 `checkConflict` 가 작동 (normalize 에 memos 포함되므로). 충돌 시 사용자가 선택 |
| E4 | 메모만 수정 후 페이지 닫힘 | 500ms debounce 안에 닫히면 업로드 누락 가능 — 기존 holdings 변경도 동일 한계이므로 별도 보강 X |
| E5 | 목표가/손절가 입력 오타 (음수, 0) | 입력 시 차단 + 사용자 피드백 |
| E6 | 같은 ticker 가 여러 그룹에 있는데 메모는 1개 | 의도된 동작 — 모든 그룹 카드에 같은 메모 표시 |
| E7 | Drive 다운로드로 메모 통째 덮어쓰기 | 사용자가 sync ON 했고 충돌 다이얼로그에서 "Drive 가져오기" 선택한 경우만 발생. 기존 동작과 일관 |

**E1 결정**: 종목 삭제와 메모 삭제를 분리. 사용자가 메모 다이얼로그에서 명시적으로 [삭제]
하거나, 모든 콘텐츠를 비워야만 메모 삭제. 잘못 종목을 지워도 메모는 살아있어 복구 가능.

## 8. 구현 순서

1. **types.ts** — `Memo`, `MemoColor` 추가
2. **db.ts** — 스키마 v2, CRUD 5개 함수, `exportAll` 에 memos 포함
3. **syncManager.ts** — `normalize()` + `downloadFromDrive()` 수정
4. **memoColor.ts** — Tailwind 매핑 헬퍼
5. **MemoDialog.tsx** — 신규 다이얼로그
6. **StockCard.tsx** — 메모 아이콘, 태그 칩, 도달 인디케이터
7. **MobileStockCard.tsx** — 동일 통합 (모바일 레이아웃)
8. **App.tsx (또는 그룹 뷰 컨테이너)** — memos 상태 관리, MemoDialog 연결
9. **수동 검증** — 메모 저장/삭제/색상 변경 후 Drive `portfolio.json` 내용 확인

## 9. 비범위 (Plan 과 동일, 재확인)

- 알림(브라우저 푸시)
- 메모 히스토리/리비전
- 차트 상의 메모 핀
- 메모 검색/필터 UI

## 10. 다음 단계

`/pdca do stock-memo` — 위 §8 순서대로 구현 시작.
