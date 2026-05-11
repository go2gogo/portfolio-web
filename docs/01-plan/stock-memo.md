# Plan: 종목별 메모 (stock-memo)

## 목적

포트폴리오 종목 각각에 대해 사용자가 메모, 목표가/손절가, 태그/색상 라벨을 기록하고
**기존 구글 드라이브 동기화 흐름에 함께 백업/복원**되도록 한다.

## 배경 / 제약

- 현재 portfolio.json (Drive appdata) 에는 `holdings`, `peaks`, `settings` 만 저장됨
- 종목 식별은 `ticker__account` 복합키이지만, **메모는 종목 단위(=ticker)** 가 자연스러움
  (같은 005930 을 "보유"와 "관심"에서 다른 메모를 다는 케이스는 드묾)
- 정적 사이트(GitHub Pages) + IndexedDB(Dexie) + Drive REST 구조 유지
- 새 Drive 파일을 만들지 않고 portfolio.json 한 파일에 묶어서 저장

## 사용자 스토리

1. 종목 카드(StockCard)에서 메모 아이콘을 누르면 메모 다이얼로그가 뜬다.
2. 텍스트 메모(자유 텍스트), 목표가, 손절가, 태그(짧은 라벨), 색상을 입력/수정/삭제할 수 있다.
3. 메모를 단 종목은 카드에 표식(인디케이터)이 보인다.
4. 구글 드라이브 동기화가 켜져 있으면, 다른 기기에서도 같은 메모가 보인다.
5. 동기화 OFF 상태에서도 IndexedDB 에 저장되어 같은 브라우저에서는 유지된다.
6. 기존 portfolio.json (memos 필드 없는 구버전) 을 복원해도 holdings/peaks 는 정상 작동.

## 데이터 모델

새 인터페이스 `Memo`:

```ts
interface Memo {
  ticker: string;           // PK
  text?: string;            // 자유 텍스트 메모
  targetPrice?: number;     // 목표가 (도달 시 카드에 표시)
  stopPrice?: number;       // 손절가
  tag?: string;             // 짧은 라벨 (예: "장기보유", "관심")
  color?: string;           // 색상 ID (예: "red"|"yellow"|"green"|"blue"|"purple"|"gray")
  updatedAt: string;        // ISO 8601 — 향후 충돌 해결용
}
```

Dexie 테이블 추가 (스키마 v2):
```ts
this.version(2).stores({
  holdings: "&id, ticker, account",
  peaks: "&ticker",
  config: "&key",
  memos: "&ticker",            // 새 테이블
});
```

`ExportPayload` 확장:
```ts
interface ExportPayload {
  holdings: Stock[];
  peaks: Record<string, number>;
  memos?: Memo[];              // 새 필드 (optional — 구버전 portfolio.json 호환)
  exported_at: string;
  settings?: { ... };
}
```

## 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `src/types.ts` | `Memo` 인터페이스 추가 (export) |
| `src/lib/db.ts` | `memos` 테이블 + CRUD 함수 (`loadMemos`, `getMemo`, `upsertMemo`, `deleteMemo`, `replaceAllMemos`) + `ExportPayload.memos` 추가 + `exportAll` 에 memos 포함 |
| `src/lib/syncManager.ts` | `normalize()` 에 memos 포함 (ping-pong 회피용 결정적 직렬화) + `downloadFromDrive()` 에서 `replaceAllMemos` 호출 |
| `src/components/StockCard.tsx` (또는 `MobileStockCard.tsx`) | 메모 진입점 + 표식 인디케이터 |
| `src/components/MemoDialog.tsx` (신규) | 메모 편집 다이얼로그 (텍스트/목표가/손절가/태그/색상) |
| `src/components/SettingsDialog.tsx` | (검토) 내보내기/가져오기 JSON 에 memos 가 자동 포함되므로 별도 UI 변경은 불필요 예상 |

## 동기화 흐름 영향

1. **업로드**: `exportAll()` 결과에 `memos` 포함 → 자동으로 portfolio.json 에 들어감
2. **다운로드**: `replaceAllMemos(data.memos ?? [])` 호출 — undefined 면 빈 배열로 처리 (기존 데이터 보존이 아닌 **덮어쓰기**, holdings/peaks 와 동일 동작)
3. **충돌 회피 정규화**: `normalize()` 가 memos 도 정렬·포함해야 함. 안 그러면 메모만 수정한 변경이 "내용 동일"로 판정되어 업로드가 누락됨
4. **자동 sync**: 메모 변경 시 `scheduleAutoSync()` 호출 (기존 holdings 변경과 동일 패턴)

## 충돌·복원 시나리오 검증 포인트

- [ ] 구버전 portfolio.json (memos 없음) 복원 → holdings/peaks 정상, memos 는 빈 상태
- [ ] 신버전 → 구버전 클라이언트로 복원 → memos 필드는 무시되고 holdings/peaks 만 적용 (구 코드가 memos 무시)
- [ ] 메모만 수정 후 자동 sync → Drive 에 업로드 발생 (normalize 검증)
- [ ] 다기기 동시 편집 → 기존 `checkConflict` 로직이 그대로 작동 (memos 도 비교 대상)

## UI 디자인 가이드

- 메모 진입점: 카드 우측 상단 아이콘 (lucide `StickyNote` 또는 `MessageSquare`)
- 메모 있는 종목: 아이콘 색상 강조 (color 라벨 적용 시 해당 색)
- 카드 본문에 작은 색상 도트 / 태그 칩 1개 노출 (있을 때만)
- 목표가/손절가 도달 시: 카드 우측에 ▲▼ 작은 인디케이터 (현재가 비교)

## 비범위 (NOT scope)

- 알림(브라우저 푸시) — 도달 시 알림 보내기는 제외, 시각적 표시까지만
- 메모 히스토리/리비전 관리 — `updatedAt` 만 갱신, 이전 값 보존 X
- 종목별 차트 위 메모 핀(annotation) — chart 통합은 후속 작업
- 메모 검색/필터링 — 후속 작업

## 다음 단계

`/pdca design stock-memo` 로 설계 문서(다이얼로그 UI 와이어, 상태 흐름, 엣지케이스) 작성 후 구현.
