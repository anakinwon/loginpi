# PRD_20_FEEDBACK — 이용후기 + Bean 보상 시스템

**마지막 수정:** 2026-06-24  
**상태:** Phase 1 (기획 완료)  
**작성자:** Claude Code (feedback-reward-architect)

---

## 1. 개요

### 1-1. 목적
- **PiCafé™ 카페 이용 후기** — 채팅방 참여 후 별점·본문·이미지로 후기 작성
- **PiShop™ 상품 구매 후기** — 주문 완료 후 별점·본문·이미지로 후기 작성
- **Bean 토큰 자동 보상** — 후기 점수(1~5점)에 따라 60~100 Bean 자동 지급
- **신뢰 생태계 구축** — 진정성 있는 커뮤니티 피드백을 통한 평판 시스템

### 1-2. 배경
- cafe.pi의 최상위 북극성: **활성 사용자 수 증대** (StatsDashboard 기준)
- 후기 시스템 = 사용자 참여도 및 신뢰도 증대의 핵심 기능
- Bean 보상 = 참여 인센티브 (기존 Bean 경제 인프라 재활용)
- 어뷰징 방지 = 거래 인증 + 중복 방지 + 의미 있는 본문 요구

### 1-3. 핵심 가치 명제
**"진정한 거래 경험을 공유하고, 후기로 커뮤니티를 풍부하게 — Bean 보상으로 참여를 격려한다."**

---

## 2. 사용자 스토리

### 2-1. 구매자 (PiShop™ 고객)
```
As a PiShop™ 구매자
I want to 상품 구매 후 나의 경험을 별점·사진과 함께 공유하고
So that 다른 구매자가 신뢰할 수 있는 정보를 얻고, 나는 Bean 보상을 받을 수 있다
```

### 2-2. 카페 참여자 (PiCafé™ 사용자)
```
As a PiCafé™ 카페 멤버
I want to 채팅방 경험을 별점·리뷰로 남기고
So that 카페 주인이 피드백을 받고, 나는 Bean 보상을 얻을 수 있다
```

### 2-3. 카페 주인 (PiCafé™ 매장주)
```
As a 카페 주인
I want to 카페에 대한 피드백을 조회·분석하고, 부적절한 후기는 숨길 수 있고
So that 카페 평판을 관리하고 운영 개선에 활용할 수 있다
```

### 2-4. 상품 판매자 (PiShop™ 판매자)
```
As a PiShop™ 판매자
I want to 판매 상품에 대한 평가·후기를 조회하고
So that 상품 품질 개선 및 마케팅 근거로 활용할 수 있다
```

### 2-5. 관리자 (cafe.pi 운영팀)
```
As a 관리자
I want to 부적절한 후기를 숨기고, 신고된 후기를 처리하고, 전체 후기 통계를 추적하고
So that 플랫폼의 신뢰도를 유지하고 어뷰징을 방지할 수 있다
```

---

## 3. 기능 요구사항 (FRD)

### 3-1. 후기 작성 (Create)

#### 3-1-1. 카페 후기 작성
- **진입점:** 채팅방 나가기 시 모달 노출 (선택사항)
- **자격:**
  - 해당 카페에 최소 1회 이상 메시지 발송한 사용자만
  - 동일 카페당 1회만 작성 가능 (update는 24시간 내)
  - 자신이 만든 카페는 후기 불가
- **입력 필드:**
  - `fbck_scr` (1~5점, 필수) — 별점 UI
  - `fbck_cn` (텍스트, 최소 10자, 최대 500자, 필수)
  - `fbck_img` (이미지, 선택, 최대 5개) — URL 저장

#### 3-1-2. 상품 후기 작성
- **진입점:** 주문 상세 페이지 → "후기 작성" 버튼 (주문 완료 상태에서만)
- **자격:**
  - 실제 구매·결제 완료한 사용자만 (`mps_order.order_id` 링크)
  - 동일 주문당 1회만 작성 가능
  - 자신이 판매한 상품은 후기 불가
- **입력 필드:**
  - `fbck_scr` (1~5점, 필수)
  - `fbck_cn` (텍스트, 최소 10자, 최대 500자, 필수)
  - `fbck_img` (이미지, 선택, 최대 3개)

#### 3-1-3. 후기 저장 + Bean 자동 지급
- **원자적 처리:**
  ```
  1. fbck_mst INSERT (fbck_id, usr_id, shop_id/order_id, fbck_scr, fbck_cn, bean_rwrd_qty=0, rwrd_yn='N')
  2. fbck_img INSERT (최대 5개)
  3. fn_bean_apply('REWARD', bean_qty, ref_id=fbck_id) 호출
  4. fbck_mst UPDATE (bean_rwrd_qty, rwrd_yn='Y', rwrd_dtm=NOW())
  ```
- **실패 시:** 모든 작업 ROLLBACK, 사용자 오류 메시지 표시

### 3-2. 후기 조회 (Read)

#### 3-2-1. 후기 단건 조회
- `GET /api/feedback/[fbck_id]` — 상세 조회
- 응답: fbck_mst + fbck_img[] + 작성자명(마스킹)

#### 3-2-2. 후기 목록 조회
- `GET /api/feedback/list?shop_id=[id]&order_id=[id]&page=1&limit=20`
- 필터링:
  - `shop_id` — 카페별 후기 목록
  - `order_id` — 주문별 후기 목록
  - `del_yn='N'` and `hide_yn='N'` — 삭제·숨김 제외
- 정렬: 최신순 (reg_dtm DESC)
- 응답: fbck_scr 평균, 5점/4점/3점/2점/1점 분포, 후기 목록

#### 3-2-3. 카페·상품별 평점 계산
- `SELECT AVG(fbck_scr), COUNT(*) FROM fbck_mst WHERE shop_id=? AND del_yn='N' AND hide_yn='N'`
- 표시: ⭐ 평균 점수 + 총 후기 수 (카페/상품 상세 페이지)

### 3-3. 후기 수정 (Update)

#### 3-3-1. 후기 수정 (작성자만)
- `PATCH /api/feedback/[fbck_id]/update` — 수정 권한: 작성자 또는 admin
- **제약:**
  - 작성 후 24시간 이내만 수정 가능
  - 수정 후에도 Bean 보상은 **재지급 안 함** (원본 점수 기준)
  - 점수를 낮춰도 Bean 환수 안 함 (한 방향 인센티브)
- **수정 가능 필드:**
  - `fbck_scr` (점수 변경 가능, 재보상 X)
  - `fbck_cn` (본문)
  - `fbck_img` (이미지 추가/삭제)

#### 3-3-2. 수정 이력 추적
- `modr_id`, `mod_dtm` 자동 업데이트
- 논리삭제 원칙: 수정 전 버전 보관 필요 시 별도 테이블 (향후 고려)

### 3-4. 후기 삭제 (Delete)

#### 3-4-1. 후기 삭제 (작성자·shop_owner·admin)
- `DELETE /api/feedback/[fbck_id]` — 논리삭제만
- **처리:**
  - `del_yn='Y'`, `del_dtm=NOW()` 설정
  - Bean 보상 환수 **안 함** (선의의 후기 삭제도 보상 유지)
  - fbck_img는 cascade 논리삭제 (soft delete)

### 3-5. 후기 관리 (Admin)

#### 3-5-1. 후기 숨김/공개 (관리자)
- `PATCH /api/feedback/admin/[fbck_id]/visibility?hide_yn=Y`
- 사용 사례:
  - 부적절한 언어/욕설 → 숨김
  - 신고된 후기 → 조사 후 숨김/공개
  - 스팸성 후기 → 숨김 + Bean 환수(향후)
- 응답: hide_yn, hide_reason_txt, hide_dtm

#### 3-5-2. 후기 신고 처리
- 신고 접수: `POST /api/feedback/[fbck_id]/report` (누구나)
  - 신고 사유: 욕설/부적절/스팸/거짓정보
  - 신고자 기록 (추적용)
- 관리자 조회: `/api/admin/feedback/reports` (pending/resolved)
- 관리자 처리: `/api/admin/feedback/reports/[report_id]/resolve`

#### 3-5-3. 후기 통계
- `GET /api/admin/feedback/stats` — 전체 통계
  - 총 후기 수, 평균 점수, 점수 분포
  - 일일/주간/월간 후기 작성 추이
  - 신고 현황 (pending/resolved)

### 3-6. Bean 보상 정책

#### 3-6-1. 점수별 Bean 지급 (정본)
| 점수 | Bean | 비고 |
|------|------|------|
| 1점 | 60 Bean | 최저 평가 |
| 2점 | 70 Bean | |
| 3점 | 80 Bean | 중간 평가 |
| 4점 | 90 Bean | |
| 5점 | 100 Bean | 최고 평가 |

- **단일 출처:** bean_fee_plan에서 동적 조회 (하드코딩 금지)
- **코드값:** `fee_knd_cd='REWARD'`, `prod_ctgr_cd='FBCK_REWARD'`

#### 3-6-2. 멱등 처리
- **중복 지급 방지:**
  - `ref_id=fbck_id` + `txn_tp='REWARD'` 기준
  - fn_bean_apply 내부 중복 검사 (bean_txn 조회)
- **예시:**
  - POST /api/feedback/create 재시도 시에도 Bean 1회만 지급
  - 네트워크 실패 후 재요청 → 멱등성 보장

#### 3-6-3. 보상 지급 타이밍
- **즉시:** 후기 저장 직후 (synchronous)
- **기록:** bean_txn에 `ref_id=fbck_id`, `memo_txt='후기 작성 보상 (5점)'`

#### 3-6-4. 환수 규칙
- **환수 안 함:**
  - 후기 수정 시 (점수 낮춤 → Bean 환수 X)
  - 후기 삭제 시 (선의 삭제도 보상 유지)
- **환수 고려:**
  - 관리자가 후기 숨김 → 향후 옵션 추가 (현 단계 미구현)

---

## 4. 비기능 요구사항 (NFR)

### 4-1. 성능
- **목표:** 후기 조회 < 200ms (P95), 후기 작성 < 500ms (end-to-end)
- **인덱싱:**
  - `fbck_mst(shop_id, del_yn, hide_yn, reg_dtm DESC)` — 카페별 목록
  - `fbck_mst(order_id, del_yn)` — 주문별 목록
  - `fbck_mst(usr_id, reg_dtm DESC)` — 사용자별 이력
  - `fbck_img(fbck_id)` — 이미지 조회

### 4-2. 확장성
- **샤딩 고려사항:** (향후)
  - fbck_mst row 추정: 일 1000건 × 365일 × 5년 = 1.8M건
  - Supabase 자동 파티셔닝 (연 단위) 고려

### 4-3. 보안
- **접근 제어:**
  - 후기 작성: 진정한 거래 사용자만 (order_id/message_history 검증)
  - 후기 수정: 작성자·shop_owner·admin만
  - 후기 삭제: 작성자·shop_owner·admin만
  - 후기 숨김: admin만
- **입력 검증:**
  - fbck_cn: 10~500자, XSS 필터링
  - fbck_scr: 1~5 정수만
  - fbck_img URL: 화이트리스트 도메인 (S3/Supabase Storage)

### 4-4. 규정 준수
- **데이터 품질:** 부호 정합성, Bean 거래 원자성 보장
- **감사 추적:** 모든 후기 작성·수정·삭제·숨김 이력 기록 (regr_id, reg_dtm 등)

---

## 5. Bean 보상 정책 상세

### 5-1. 현재 Bean 경제 인프라
- `bean_wlt` — 사용자 Bean 지갑 (잔액 캐시)
- `bean_txn` — Bean 거래 원장 (모든 증감 이력, append-only)
- `fn_bean_apply` RPC — 지갑·원장 원자적 동기화
  ```sql
  fn_bean_apply(
    p_usr_id,      -- 사용자 ID
    p_txn_tp,      -- 'REWARD' (보상), 'CHARGE' (충전), 'SPEND' (사용), 'REFUND' (환불)
    p_bean_amt,    -- 양수 (충전/보상/환불) 또는 음수 (사용)
    p_pi_amt,      -- CHARGE 시만 Pi 금액 (그 외 NULL)
    p_pymnt_id,    -- CHARGE 시만 결제 ID
    p_ref_tp,      -- 참조 타입 ('FBCK' = 후기 보상)
    p_ref_id,      -- 참조 ID (fbck_id)
    p_memo         -- 메모 ('후기 작성 보상 (5점)')
  ) RETURNS bean_token_wallet
  ```

### 5-2. bean_fee_plan 조회 패턴
```typescript
// 타입스크립트 예시 (하드코딩 금지)
async function getRewardBeans(score: number): Promise<number> {
  const result = await supabaseAdmin
    .from('bean_fee_plan')
    .select('amt_bean')
    .match({
      fee_knd_cd: 'REWARD',
      prod_ctgr_cd: 'FBCK_REWARD',
      grade_cd: 'GENERAL', // 향후 등급별 확장
      use_yn: 'Y',
      del_yn: 'N'
    })
    // score → fee_plan_cd 매핑 (1→'FR_1', 2→'FR_2', ... 5→'FR_5')
    .eq('fee_plan_cd', `FR_${score}`)
    .maybeSingle()
  
  if (!result.data) {
    throw new Error(`후기 보상 설정 미상 (점수=${score})`)
  }
  
  return result.data.amt_bean
}
```

### 5-3. bean_fee_plan 시드 (기초 데이터)
후기 보상용 6행 추가 필요 (sql/115에서):
```sql
INSERT INTO public.bean_fee_plan
  (fee_plan_cd, subscr_div_cd, prod_ctgr_cd, fee_knd_cd, grade_cd, bill_cycle_cd,
   amt_bean, qty_limit, fee_plan_desc, sort_ord)
VALUES
('FR_1','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE',  60,0,'후기 보상 1점', 110),
('FR_2','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE',  70,0,'후기 보상 2점', 111),
('FR_3','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE',  80,0,'후기 보상 3점', 112),
('FR_4','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE',  90,0,'후기 보상 4점', 113),
('FR_5','GENERAL','FBCK_REWARD','REWARD','GENERAL','ONCE', 100,0,'후기 보상 5점', 114);
```

---

## 6. 데이터베이스 스키마

### 6-1. fbck_mst 테이블 (후기 마스터)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| `fbck_id` | UUID | PK, DEFAULT gen_random_uuid() | 후기 고유 ID |
| `usr_id` | TEXT | NOT NULL, FK→sys_user.usr_id | 작성자 사용자 ID |
| `shop_id` | UUID | NULLABLE, FK→mps_shop.shop_id | 카페 ID (카페 후기) |
| `order_id` | UUID | NULLABLE, FK→mps_order.order_id | 주문 ID (상품 후기) |
| `prod_id` | UUID | NULLABLE | 상품 ID (향후 분석용) |
| `fbck_scr` | SMALLINT | NOT NULL, 1≤scr≤5 | 별점 (1~5) |
| `fbck_cn` | TEXT | NOT NULL, 10≤len≤500 | 후기 본문 |
| `bean_rwrd_qty` | INT | DEFAULT 0 | 지급된 Bean 수 (보상 기록용) |
| `rwrd_yn` | CHAR(1) | DEFAULT 'N' | 보상 지급 여부 ('Y'/'N') |
| `rwrd_dtm` | TIMESTAMPTZ | NULLABLE | 보상 지급 일시 |
| `hide_yn` | CHAR(1) | DEFAULT 'N' | 관리자 숨김 여부 ('Y'/'N') |
| `hide_reason_txt` | TEXT | NULLABLE | 숨김 사유 (관리자 기록) |
| `hide_dtm` | TIMESTAMPTZ | NULLABLE | 숨김 일시 |
| `del_yn` | CHAR(1) | DEFAULT 'N' | 논리삭제 여부 ('Y'/'N') |
| `del_dtm` | TIMESTAMPTZ | NULLABLE | 삭제 일시 |
| `regr_id` | TEXT | DEFAULT 'ADMIN' | 등록자 ID |
| `reg_dtm` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 등록 일시 |
| `modr_id` | TEXT | DEFAULT 'ADMIN' | 수정자 ID |
| `mod_dtm` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 수정 일시 |

**제약조건:**
```sql
-- 카페 후기: shop_id NOT NULL, order_id NULL
-- 상품 후기: order_id NOT NULL, shop_id NULL (또는 shop_id 허용)
-- 중복 방지
UNIQUE (usr_id, shop_id) WHERE shop_id IS NOT NULL AND del_yn='N' -- 카페 후기 1회
UNIQUE (usr_id, order_id) WHERE order_id IS NOT NULL AND del_yn='N' -- 상품 후기 1회

-- Bean 보상
CHECK (rwrd_yn IN ('Y', 'N'))
CHECK (bean_rwrd_qty >= 0)
CHECK ((rwrd_yn='Y' AND rwrd_dtm IS NOT NULL) OR (rwrd_yn='N' AND rwrd_dtm IS NULL))
```

### 6-2. fbck_img 테이블 (후기 이미지)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| `fbck_img_id` | UUID | PK, DEFAULT gen_random_uuid() | 이미지 고유 ID |
| `fbck_id` | UUID | NOT NULL, FK→fbck_mst.fbck_id | 후기 ID |
| `img_ord` | SMALLINT | NOT NULL, 1≤ord≤5 | 순서 (1~5) |
| `img_url` | TEXT | NOT NULL | 이미지 URL (S3/Supabase Storage) |
| `del_yn` | CHAR(1) | DEFAULT 'N' | 논리삭제 여부 |
| `del_dtm` | TIMESTAMPTZ | NULLABLE | 삭제 일시 |
| `regr_id` | TEXT | DEFAULT 'ADMIN' | 등록자 ID |
| `reg_dtm` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 등록 일시 |
| `modr_id` | TEXT | DEFAULT 'ADMIN' | 수정자 ID |
| `mod_dtm` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 수정 일시 |

**제약조건:**
```sql
UNIQUE (fbck_id, img_ord) WHERE del_yn='N' -- 후기당 순서 중복 방지
CHECK (img_ord >= 1 AND img_ord <= 5)
```

### 6-3. fbck_report 테이블 (후기 신고) — 선택 사항

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| `rpt_id` | UUID | PK | 신고 고유 ID |
| `fbck_id` | UUID | NOT NULL, FK | 신고 대상 후기 |
| `rptr_id` | TEXT | NOT NULL, FK | 신고자 사용자 ID |
| `rpt_rsn_cd` | VARCHAR(20) | NOT NULL | 신고 사유 코드 (ABUSIVE/SPAM/FALSE/OTHER) |
| `rpt_cn` | TEXT | NULLABLE | 신고 상세 내용 |
| `rpt_stt_cd` | VARCHAR(10) | DEFAULT 'PENDING' | 상태 (PENDING/RESOLVED) |
| `rslv_actnn_cd` | VARCHAR(20) | NULLABLE | 처리 조치 (HIDE/DELETE/IGNORE) |
| `del_yn` | CHAR(1) | DEFAULT 'N' | 논리삭제 |
| `regr_id` | TEXT | DEFAULT 'ADMIN' | 등록자 |
| `reg_dtm` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 등록 일시 |
| `modr_id` | TEXT | DEFAULT 'ADMIN' | 처리자 |
| `mod_dtm` | TIMESTAMPTZ | DEFAULT CURRENT_TIMESTAMP | 처리 일시 |

---

## 7. 인덱스 전략

```sql
-- fbck_mst 인덱스
CREATE INDEX idx_fbck_mst_shop_active
  ON public.fbck_mst(shop_id, del_yn, hide_yn, reg_dtm DESC)
  WHERE shop_id IS NOT NULL AND del_yn='N';

CREATE INDEX idx_fbck_mst_order_active
  ON public.fbck_mst(order_id, del_yn, hide_yn)
  WHERE order_id IS NOT NULL AND del_yn='N';

CREATE INDEX idx_fbck_mst_usr
  ON public.fbck_mst(usr_id, reg_dtm DESC)
  WHERE del_yn='N';

CREATE INDEX idx_fbck_mst_score
  ON public.fbck_mst(fbck_scr, reg_dtm DESC)
  WHERE del_yn='N' AND hide_yn='N';

-- fbck_img 인덱스
CREATE INDEX idx_fbck_img_fbck
  ON public.fbck_img(fbck_id)
  WHERE del_yn='N';

-- fbck_report 인덱스 (향후)
CREATE INDEX idx_fbck_report_fbck_status
  ON public.fbck_report(fbck_id, rpt_stt_cd)
  WHERE del_yn='N';
```

---

## 8. API 엔드포인트 명세

### 8-1. 후기 작성
```
POST /api/feedback/create
Content-Type: application/json

Request:
{
  "shop_id": "uuid (카페 후기)",
  "order_id": "uuid (상품 후기)",
  "fbck_scr": 5,
  "fbck_cn": "정말 좋은 커피! 다시 오겠습니다.",
  "fbck_img": [
    { "img_ord": 1, "img_url": "s3://..." },
    { "img_ord": 2, "img_url": "s3://..." }
  ]
}

Response (201):
{
  "fbck_id": "uuid",
  "fbck_scr": 5,
  "bean_rwrd_qty": 100,
  "rwrd_dtm": "2026-06-24T10:30:00Z",
  "message": "후기가 저장되었고, 100 Bean 보상을 받으셨습니다!"
}

Error (400):
{
  "error": "InvalidInput",
  "message": "fbck_cn은 최소 10자 이상이어야 합니다"
}

Error (401):
{
  "error": "Unauthorized",
  "message": "로그인이 필요합니다"
}

Error (403):
{
  "error": "Forbidden",
  "message": "자신이 만든 카페에는 후기를 작성할 수 없습니다"
}

Error (409):
{
  "error": "Conflict",
  "message": "이 카페에 대해 이미 후기를 작성했습니다"
}
```

### 8-2. 후기 조회
```
GET /api/feedback/list?shop_id=uuid&page=1&limit=20

Response (200):
{
  "data": [
    {
      "fbck_id": "uuid",
      "usr_id": "user123",
      "display_name": "아나킨****", // 마스킹
      "fbck_scr": 5,
      "fbck_cn": "좋아요",
      "fbck_img": ["s3://..."],
      "reg_dtm": "2026-06-24T10:30:00Z"
    }
  ],
  "stats": {
    "avg_score": 4.5,
    "total_count": 100,
    "score_dist": {
      "5": 50,
      "4": 30,
      "3": 15,
      "2": 4,
      "1": 1
    }
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

### 8-3. 후기 수정
```
PATCH /api/feedback/[fbck_id]/update
Content-Type: application/json

Request:
{
  "fbck_scr": 4,
  "fbck_cn": "다시 생각해보니 4점이 맞는 것 같아요"
}

Response (200):
{
  "fbck_id": "uuid",
  "fbck_scr": 4,
  "message": "후기가 수정되었습니다. (Bean 재보상 없음)"
}

Error (403):
{
  "error": "Forbidden",
  "message": "작성 후 24시간이 지났습니다"
}
```

### 8-4. 후기 삭제
```
DELETE /api/feedback/[fbck_id]

Response (200):
{
  "message": "후기가 삭제되었습니다"
}
```

### 8-5. 관리자: 후기 숨김
```
PATCH /api/feedback/admin/[fbck_id]/visibility
Content-Type: application/json

Request:
{
  "hide_yn": "Y",
  "hide_reason_txt": "욕설 포함"
}

Response (200):
{
  "fbck_id": "uuid",
  "hide_yn": "Y",
  "hide_reason_txt": "욕설 포함",
  "hide_dtm": "2026-06-24T11:00:00Z"
}
```

### 8-6. 관리자: 후기 통계
```
GET /api/admin/feedback/stats?date_from=2026-06-01&date_to=2026-06-30

Response (200):
{
  "total_count": 1500,
  "avg_score": 4.3,
  "score_dist": { "5": 600, "4": 450, ... },
  "daily_trend": [
    { "date": "2026-06-01", "count": 50, "avg_score": 4.2 },
    ...
  ],
  "report_stats": {
    "pending": 12,
    "resolved": 45
  }
}
```

---

## 9. UI/UX 흐름

### 9-1. 후기 작성 흐름

#### PiShop™ 상품 후기
1. **진입점:** 주문 상세 페이지 (order_status=DELIVERED)
2. **모달 노출:** "이 상품에 대한 후기를 남겨주세요" (선택)
3. **입력:**
   - 별점 선택 (⭐ 1~5)
   - 본문 입력 (최소 10자, 실시간 검증)
   - 이미지 업로드 (최대 3개, S3)
4. **미리보기:** 입력 내용 확인
5. **제출:**
   - "후기 작성" 버튼 클릭
   - 로딩 표시 (별 회전 애니메이션)
   - 성공 토스트: "후기가 저장되었고, **100 Bean** 보상을 받으셨습니다!" + BeanIcon
   - 실패: 에러 메시지 + 재시도 버튼

#### PiCafé™ 카페 후기
1. **진입점:** 채팅방 나가기 시 모달 (선택)
2. **입력:** (상동)
3. **제출:** (상동)

### 9-2. 후기 조회 흐름

#### 카페 상세 페이지
1. **평점 요약:** ⭐ 4.5 (100개 후기)
2. **평가 분포:** 막대 그래프 (5점 50건, 4점 30건, ...)
3. **후기 목록:**
   - 최신순 정렬
   - 각 후기: 별점 | 마스킹된 작성자명 | 작성일 | 본문 (처음 50자 + "...") | 이미지 썸네일
   - "모두 보기" 링크 → 전체 목록 페이지
4. **필터 (향후):** 별점별 필터, 최신/인기순 정렬

#### 전체 후기 목록 페이지 (`/feedback?shop_id=uuid`)
1. 정렬: 최신순 (기본)
2. 페이지네이션: 20건/페이지
3. 각 후기: 이미지 3개까지 썸네일, 클릭 → 상세 조회

### 9-3. 관리자 후기 관리 페이지
1. **탭:**
   - "활성 후기" (일반)
   - "신고 대기" (pending)
   - "조치됨" (resolved)
2. **각 후기:**
   - 체크박스 (다중 선택)
   - 작성자명 | 점수 | 본문 미리보기 | 작성일 | 신고 수
   - 액션: "숨김" | "보기" | "신고 처리"
3. **숨김 사유 입력:** 드롭다운 (욕설/부적절/스팸/거짓정보) + 메모

---

## 10. 어뷰징 방지 전략

### 10-1. 거래 인증
- **카페 후기:** 
  - 요구사항: 해당 카페에 최소 1회 메시지 발송
  - 검증: `msg_msg.room_id` 조회 확인 (join 후 msg 있는지)
  - 코드:
    ```typescript
    const hasMessaged = await supabaseAdmin
      .from('msg_msg')
      .select('id', { count: 'exact' })
      .match({ room_id: roomId, usr_id: userId })
      .limit(1)
    
    if (!hasMessaged.count) {
      throw new Error('후기를 작성하려면 채팅방에 참여해야 합니다')
    }
    ```
- **상품 후기:**
  - 요구사항: 실제 구매·결제 완료 (order_status=DELIVERED)
  - 검증: `mps_order.order_id` FK + `order_status='DELIVERED'`
  - 코드:
    ```typescript
    const order = await supabaseAdmin
      .from('mps_order')
      .select('*')
      .match({ order_id: orderId, usr_id: userId, order_status: 'DELIVERED' })
      .maybeSingle()
    
    if (!order.data) {
      throw new Error('배송 완료된 주문에만 후기를 작성할 수 있습니다')
    }
    ```

### 10-2. 중복 방지
- **UNIQUE 제약:**
  ```sql
  UNIQUE (usr_id, shop_id) WHERE shop_id IS NOT NULL AND del_yn='N'
  UNIQUE (usr_id, order_id) WHERE order_id IS NOT NULL AND del_yn='N'
  ```
- **동작:**
  - 중복 시도 시 DB 레벨 UNIQUE 위반 → HTTP 409 (Conflict)
  - 사용자 메시지: "이 상품에 대해 이미 후기를 작성했습니다"

### 10-3. 자기 매장 후기 방지
- **카페 후기:**
  ```typescript
  const shop = await supabaseAdmin
    .from('mps_shop')
    .select('shop_owner_id')
    .eq('shop_id', shopId)
    .maybeSingle()
  
  const user = await getSessionUser()
  
  if (shop.data.shop_owner_id === user.id) {
    throw new Error('자신이 만든 카페에는 후기를 작성할 수 없습니다')
  }
  ```
- **상품 후기:**
  ```typescript
  const item = await supabaseAdmin
    .from('mps_item')
    .select('seller_id')
    .eq('item_id', itemId)
    .maybeSingle()
  
  if (item.data.seller_id === user.id) {
    throw new Error('자신이 판매하는 상품에는 후기를 작성할 수 없습니다')
  }
  ```

### 10-4. 의미 있는 본문 요구
- **최소 길이:** 10자 (공백 제외)
- **필터링:** 반복 문자(ㅋㅋㅋㅋㅋ, 1111111) 제거 후 검증
- **코드:**
  ```typescript
  const cleanText = fbckCn.replace(/[^\w가-힣]/g, '')
  if (cleanText.length < 10) {
    throw new Error('후기는 최소 10자 이상이어야 합니다')
  }
  ```

### 10-5. 관리자 숨김 처리
- **근거 추적:**
  - `hide_reason_txt` 필수 기록
  - 누가/언제 숨겼는지 `modr_id`, `mod_dtm`
- **신고 통합:**
  - 신고 받은 후기 → 조사 → 숨김/공개 결정
  - 통계: 월간 "조치된 신고" 수 추적

### 10-6. Bean 재지급 방지
- **정책:**
  - 후기 수정 시 점수 변경 → Bean 재지급 안 함
  - 멱등성: fn_bean_apply에서 ref_id=fbck_id로 중복 차단
- **감시:**
  - bean_txn에서 REWARD 타입 + ref_id=fbck_id 중복 검사
  - 모니터링: 월간 "중복 Bean" 시도 수

---

## 11. 구현 로드맵

### Phase 1: 기획 및 데이터 설계 (현재)
- [x] PRD 문서 작성
- [x] DB 스키마 설계
- [ ] DA 표준 검증 (da-governance-expert)

### Phase 2: Backend 개발 (2주)
- [ ] sql/115_fbck_*.sql 마이그레이션
- [ ] API 엔드포인트 구현 (6개)
- [ ] fn_bean_apply 연동 (원자성 테스트)
- [ ] 입력 검증 + 어뷰징 방지 로직
- [ ] 유닛 테스트 (50% 커버리지)

### Phase 3: Frontend 개발 (2주)
- [ ] 후기 작성 모달 (FeedbackFormModal.tsx)
- [ ] 별점 UI (StarRating.tsx)
- [ ] 후기 목록 (FeedbackList.tsx)
- [ ] 이미지 업로드 (S3 연동)
- [ ] Bean 보상 토스트 표시

### Phase 4: 관리자 기능 (1주)
- [ ] 후기 관리 페이지 (/admin/feedback)
- [ ] 숨김/공개 토글
- [ ] 신고 접수 + 처리

### Phase 5: QA 및 배포 (1주)
- [ ] 전체 기능 테스트
- [ ] Pi Browser 실기기 검증
- [ ] KISA 보안 감시
- [ ] Vercel 프로덕션 배포

**예상 일정:** 6주 (병렬 진행 시 4주)

---

## 12. 모니터링 및 KPI

### 12-1. 핵심 지표
- **후기 작성량:** 일일/주간/월간 신규 후기 수
- **평점 분포:** 5점 비율, 평균 점수 추이
- **참여율:** 구매자 중 후기 작성 비율 (%)
- **Bean 보상액:** 월간 보상 총량 (Bean)
- **신고 현황:** 월간 신고 수, 처리율 (%)

### 12-2. 대시보드 메트릭
- `SELECT COUNT(*), AVG(fbck_scr), DATE(reg_dtm) FROM fbck_mst WHERE del_yn='N' GROUP BY DATE(reg_dtm)`
- 시각화: 일별 후기 수 + 평점 추이 그래프

### 12-3. 알림 임계값
- 신고 pending ≥ 10건 → 알림
- 평점 < 2.5 (카페/상품) → 경고

---

## 13. 향후 확장 기능 (Backlog)

### 13-1. 후기 활용도 분석
- 최고 평가 후기 추천 정렬
- 낮은 평가 후기 추적 → shop_owner 피드백 제공
- "도움이 됨" 투표 (helpful_cnt)

### 13-2. AI 기반 분석
- 감정 분석 (긍정/중립/부정)
- 핵심 키워드 추출 (맛, 분위기, 서빙 등)
- 자동 스팸 탐지

### 13-3. 보상 시스템 고도화
- 등급별 보상 차등화 (프리미엄 카페 → 더 많은 Bean)
- 연쇄 보상 (5개 후기 작성 → 보너스 Bean)
- 이미지 첨부 보너스 (사진 있는 후기 → +10 Bean)

### 13-4. 후기 신뢰도 점수
- 후기자의 평판 점수 (많은 유용한 후기 작성 → 신뢰도 ↑)
- 후기 유용도 순 정렬

### 13-5. 다국어 지원
- i18n 적용 (후기 내용 다국어 번역)
- 각 locale별 평점 통계

---

## 14. 참고 자료

### 14-1. 기존 Bean 인프라 문서
- `docs/PRD_15_FEE.md` — Bean 경제 표준 요금
- `sql/067_bean_wallet.sql` — Bean 지갑·원장 테이블
- `sql/070_bean_tokenomics_governance.sql` — fn_bean_apply RPC

### 14-2. DA 표준 규칙
- `docs/da/데이터표준규칙.md` — 명명 규칙, 시스템 컬럼 4개
- `docs/da/README.md` — DA 거버넌스 프레임워크

### 14-3. 인증 및 보안
- `docs/PRD_2_SECURITY.md` — Pi Browser + Google OAuth 통합
- `src/lib/auth-check.ts` — getSessionUser() 활용

### 14-4. 브랜드 표기
- CLAUDE.md § 공식 브랜드 표기 — PiCafé™, PiShop™, BeanIcon
- Bean 호칭: "카페빈" (일반 콩 아님)

---

## 부록 A: Entity-Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────┐
│                       sys_user                              │
│                                                              │
│  usr_id (PK)                                               │
│  pi_username                                               │
│  nick_nm                                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ (1:N)
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼──────────────┐  │  ┌──────────────▼────────────┐
    │   fbck_mst       │  │  │     bean_wlt / bean_txn   │
    │                  │  │  │     (REWARD 기록)         │
    │  fbck_id (PK)    │  │  └───────────────────────────┘
    │  usr_id (FK)  ◄──┘  │
    │  shop_id (FK)  ◄─────┤────────► mps_shop
    │  order_id (FK)◄─────┼────────► mps_order
    │  fbck_scr      │     │
    │  fbck_cn       │     │
    │  bean_rwrd_qty │     │
    │  rwrd_yn       │     │
    │  hide_yn       │     │
    │  del_yn        │     │
    └───┬────────────┘     │
        │                  │
        │ (1:N)            │
        │                  │
    ┌───▼──────────────┐   │
    │   fbck_img       │   │
    │                  │   │
    │  fbck_img_id(PK) │   │
    │  fbck_id (FK) ◄──┘   │
    │  img_url       │     │
    │  del_yn        │     │
    └──────────────────┘   │
                           │
                    ┌──────▼─────────┐
                    │  fbck_report   │ (향후)
                    │                │
                    │  rpt_id (PK)   │
                    │  fbck_id (FK)  │
                    │  rptr_id (FK)  │
                    │  rpt_rsn_cd    │
                    │  rpt_stt_cd    │
                    └────────────────┘
```

---

**문서 버전:** 1.0  
**승인:** feedback-reward-architect  
**다음 검토:** 2026-07-15

