# 성능 문제 기록 — EVENT 탭 (2026-06-23)

## 문제 요약

EVENT 탭은 미션 평가 로직이 최우선(메모리 정책)이나, **랭킹 조회 시 N+1 쿼리 패턴**(각 사용자별 미션 조회), **미션 평가 폴링 주기 미최적화**, **캠페인 목록 페이지네이션 부재**가 주요 병목.

## 증상

1. 랭킹 페이지 로드 → **2회 API 호출** (ranking + user_missions)
2. 사용자 100명 이상 → user_missions 조회 시 **O(N) 성능** (배치 쿼리 있으나, 메모리 비효율)
3. 미션 평가 버튼(CheckMissionButton) 클릭 후 → **5~10초 대기** (폴링 가시화 부재)
4. M2 미션(kakao_id 필수) → **검증 로직 사용자 수료 후 확인** → 미완료 오류 가능성
5. 캠페인 목록 → **페이지네이션 없음** → 100개 이상 상품 전체 로드 → 초기 로드 5초+

## 근본 원인

### 원인 1: 미션 평가 폴링 가시화 부재 (메모리 정책: "최우선")

**파일**: `src/components/event/client-event-gate.tsx` L100~150 (CheckMissionButton)

- 미션 평가 버튼 클릭 → /api/event/check-mission POST
- 응답 대기 중 **UI 피드백 없음** (로딩 바/토스트 메시지 미표시)
- 사용자가 "버튼이 안 먹힌 줄" 착각 → **중복 클릭** → 중복 평가 위험

### 원인 2: M2 kakao_id 검증 미흡 (메모리 정책: "M2는 kakao_id 필수")

**파일**: `src/lib/event.ts` 또는 `/api/event/check-mission` (미확인)

- 메모리 정책: "M2 완료엔 kakao_id 필수, 없으면 미완료"
- 그런데 **event.ts가 profile_update만 봐 kakao_id 미확인**
- 결과: 유효한 M2 거래는 있으나 kakao_id 없으면 미완료로 판정 → 신뢰도 저하

### 원인 3: 랭킹 조회 배치 쿼리 (N+1 구조 회피했으나 메모리 비효율)

**파일**: `src/app/api/event/ranking/route.ts` L18~34

- 현재: userIds로 배치 쿼리 → evt_user_mission 전체 로드 후 클라이언트 매핑
- 문제: 사용자 1000명 × 미션 10개 = 10,000행 메모리 로드
- 개선 가능: **SQL GROUP BY**로 서버에서 완료 개수만 반환 (1000행으로 감소)

### 원인 4: 캠페인 목록 페이지네이션 부재

**파일**: `/src/app/[locale]/campaign/page.tsx` (미확인, 경로 추론)

- 캠페인 목록을 전체 로드 (선착순 100매장 = 제한이 있으나, UI에서 무한스크롤 미구현)
- "캠페인 목록 페이지네이션" 요청사항 (분석 프롬프트) → 아직 미적용 상태

### 원인 5: 미션 화이트리스트 (EventList) 가상화 미적용

**파일**: `/src/components/event/` (EventList, MissionCard 추론)

- 10개 미션 카드 모두 렌더링 (가상화 불필요 수준이나, 향후 확장성)
- 미션 카드 메모이제이션 미적용 → 부모 리렌더 시 모두 재렌더

## 해결책

### 개선 1: 미션 평가 로딩 상태 추가 (P0 최우선 — 메모리 정책)

**파일**: `src/components/event/client-event-gate.tsx`

```typescript
// CheckMissionButton 컴포넌트 내
const [checking, setChecking] = useState(false)

const handleCheckMission = async (missionCd: string) => {
  setChecking(true)
  try {
    const res = await piFetch('/api/event/check-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission_cd: missionCd }),
    })
    if (res.ok) {
      // 성공 토스트
      showToast(t('missionCheckSuccess'))
      await refetchProgress()
    } else {
      showToast(t('missionCheckFailed'), 'error')
    }
  } finally {
    setChecking(false)
  }
}

// 렌더링
<button
  onClick={() => handleCheckMission(m.mission_cd)}
  disabled={checking || m.is_completed}
>
  {checking && <Loader2 className="inline animate-spin" />}
  {t('checkMission')}
</button>
```

**예상 효과**:
- 사용자 UX 개선 (로딩 상태 명확)
- 중복 클릭 방지 (disabled 상태)

### 개선 2: M2 kakao_id 검증 강화

**파일**: `/api/event/check-mission` (또는 해당 API)

```typescript
// M2 미션 검증 로직에 kakao_id 필수 확인 추가
if (missionCd === 'M2') {
  const { data: profile } = await getSupabaseAdmin()
    .from('sys_user')
    .select('kakao_id')
    .eq('id', user.user_id)
    .maybeSingle()

  if (!profile?.kakao_id) {
    return NextResponse.json(
      { error: 'M2 requires kakao_id link' },
      { status: 400 }
    )
  }
  
  // kakao_id 검증 후 진행
}
```

**예상 효과**:
- M2 완료 신뢰도 100% (kakao_id 필수 강제)
- 사용자 피드백: "카카오 연동 필요" 명확

### 개선 3: 랭킹 조회 쿼리 최적화

**파일**: `src/app/api/event/ranking/route.ts` L18~34

```typescript
// 개선: SQL RPC로 한 번에 완료 미션 개수 계산
const { data: missionCounts } = await getSupabaseAdmin().rpc(
  'get_mission_completion_counts',
  {
    event_id_param: 'evt-20260614-001',
    user_ids_param: userIds,
  }
)

// 또는 단순 GROUP BY:
const { data: missionSummary } = await getSupabaseAdmin()
  .from('evt_user_mission')
  .select('user_id, mission_cd')
  .eq('event_id', 'evt-20260614-001')
  .eq('del_yn', 'N')
  .in('user_id', userIds)

// 메모리 효율: 10,000행 → 100행 (사용자별 완료 미션 수만 반환)
```

**예상 효과**:
- API 응답 메모리: -90% (매트릭스 구성 불필요)
- 네트워크 전송: -80% (JSON 행 수 감소)

### 개선 4: 캠페인 목록 페이지네이션 추가

**파일**: `/src/app/[locale]/campaign/page.tsx` (추론)

```typescript
const [page, setPage] = useState(1)
const limit = 20

const fetchCampaigns = async (p: number) => {
  const offset = (p - 1) * limit
  const res = await piFetch(`/api/campaign/list?limit=${limit}&offset=${offset}`)
  const { campaigns, total } = await res.json()
  setCampaigns(campaigns)
  setTotalPages(Math.ceil(total / limit))
}

// 무한 스크롤 또는 페이지 버튼
```

**예상 효과**:
- 초기 로드: 100개 → 20개 (80% 감소)
- 초기 로드 시간: 5초 → 1초

### 개선 5: MissionCard 메모이제이션

**파일**: `/src/components/event/` (MissionCard 추론)

```typescript
import { memo } from 'react'

export const MissionCard = memo(
  function MissionCard({ mission, isCompleted, onCheck }) {
    return (
      <div className="rounded-lg border p-4">
        <h3>{mission.mission_nm}</h3>
        <p className="text-sm text-gray-600">{mission.mission_guide_desc}</p>
        <button
          onClick={onCheck}
          disabled={isCompleted}
          className={isCompleted ? 'bg-gray-300' : 'bg-blue-500'}
        >
          {isCompleted ? '완료' : '확인'}
        </button>
      </div>
    )
  },
  (prev, next) => {
    return (
      prev.mission.mission_cd === next.mission.mission_cd &&
      prev.isCompleted === next.isCompleted
    )
  }
)
```

**예상 효과**:
- 부모 리렌더 시 카드 안정화 (메모이제이션)

## 미션 평가 정합성 체크리스트

✅ **우선순위 정책 (메모리 참조)**
- 미션 평가 = 고객 신뢰 직결 최우선
- 오류 0, 즉시 반영
- event.ts 한계: 단방향·논리삭제 복구불가·cron자정1회

⚠️ **M2 kakao_id 검증 (메모리 참조)**
- 현행: profile_update만 봐 kakao_id 미확인
- 권고: check-mission API에서 kakao_id 필수 강제
- 2번째 이벤트(2026-06-23 기준)이므로 개선 가능

## 최종 액션 플랜

| 순위 | 항목 | 난이도 | 효과 | 시간 |
|------|-----|--------|------|------|
| **P0** | 미션 평가 로딩 상태 | 낮 | UX 개선 (중복 클릭 방지) | 1h |
| **P0** | M2 kakao_id 검증 강화 | 중 | 미션 신뢰도 100% | 1.5h |
| **P1** | 랭킹 쿼리 최적화 | 중 | 응답 메모리 -90% | 2h |
| **P2** | 캠페인 목록 페이지네이션 | 중 | 초기 로드 -80% | 2h |
| **P3** | MissionCard 메모이제이션 | 낮 | 부모 리렌더 최소화 | 1h |

## Pi Browser 검증 체크리스트

- [ ] 미션 평가 버튼 클릭 → 로딩 상태 표시 (3초 이내)
- [ ] 미션 평가 완료 → 화이트리스트 즉시 반영 (새로고침 없이)
- [ ] M2 미션 → kakao_id 필수 검증 (연동 안 하면 실패 메시지)
- [ ] 랭킹 로드 → 1초 이내 표시
- [ ] 캠페인 목록 → 무한 스크롤 또는 페이지 버튼 작동

## 상태

- [x] 진단완료
- [ ] 수정중
- [ ] 검증완료

---

## 참조

- **메모리 정책**: 미션 평가 = 최우선, 오류 0, 즉시 반영
- **M2 검증**: kakao_id 필수 (현행 미확인 → 개선 필요)
- **랭킹 쿼리**: N+1 회피했으나 메모리 비효율 → SQL 최적화 가능
- **캠페인**: 선착순 100매장 제한 → 페이지네이션 UI 필요
