-- 067_sys_user_lst_area.sql : 사용자 최종 선택 분류체계(메인 대시보드, 마스터 지시 2026-10-21 "로그인 사용자가 마지막에 선택한 분류체계로 대시보드 구성")
-- DA-APPROVED: 마스터 지시 2026-10-21 — sys_user 1칼럼 추가(fn_add_cols_keep_sys 로 시스템 칼럼 맨 끝 유지), 약어 LST(최종, 표준용어 LST_MDDTM 과 같은 단어)·AREA(분류체계)·ID
-- 기록 시점 = 분류체계 화면 진입(GET /api/areas/[areaId], 하단 메뉴가 매 화면 호출)·대시보드에서 분류체계 선택. 기기와 무관(서버 저장 — Pi Browser·PC 공통)
-- FK 없음 : 분류체계는 논리 삭제라 참조가 깨지지 않고, 탈퇴·삭제된 분류체계를 가리키면 대시보드가 멤버 확인 뒤 첫 분류체계로 대체
BEGIN;

SELECT fn_add_cols_keep_sys('sys_user', $c$
  ADD COLUMN lst_area_id UUID$c$);
COMMENT ON COLUMN sys_user.lst_area_id IS '최종선택분류체계ID(메인 대시보드 기준, 분류체계 화면 진입 때 갱신)';

COMMIT;

NOTIFY pgrst, 'reload schema';
