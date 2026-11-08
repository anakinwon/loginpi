-- 163_sys_user_rejoin_hist.sql
-- ⭐동일인 재가입 정책 (마스터 지시 2026-07-02)
--   "동일인 재가입 시 del_yn을 살리면 되고, 이력으로 관리해서, 삭제 이전 기록은 보이지 않는 걸로"
--   pi_username 유일성 절대 원칙과 세트: 재가입은 새 행 생성이 아니라 기존 행 부활로 처리한다.
--
-- 컬럼 2종 추가:
--   rejoin_dtm  — 재가입(계정 부활) 일시. NULL=재가입 이력 없음.
--                 ⭐이력 컷오프: 이 시각 이전의 사용자 활동 기록은 화면에 노출하지 않는다.
--   del_rsn_cd  — 삭제사유코드. 부활 가능 여부 판정의 단일 기준.
--                 WDRW=자진탈퇴(부활 가능) · SYS_DUP=uid 재발급 중복정리(부활 가능)
--                 ADMIN_BLCK=관리자 차단(부활 불가) · NULL=기존 행 사유 미상(부활 불가, 안전 기본값)
--
-- 적용 순서: 본 파일(163) → 161(중복 정리 — del_rsn_cd 스탬프 포함) → 162(UNIQUE 인덱스)

alter table public.sys_user
  add column if not exists rejoin_dtm timestamptz null,
  add column if not exists del_rsn_cd text null;

comment on column public.sys_user.rejoin_dtm is '재가입(계정 부활) 일시 — 이 시각 이전 활동 기록 숨김 컷오프';
comment on column public.sys_user.del_rsn_cd is '삭제사유코드: WDRW(자진탈퇴)·ADMIN_BLCK(관리자차단)·SYS_DUP(uid재발급 중복정리) — NULL=사유미상(부활 불가)';

-- 검증
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'sys_user'
  and column_name in ('rejoin_dtm', 'del_rsn_cd');
