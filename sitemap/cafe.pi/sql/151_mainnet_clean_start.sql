-- DA-APPROVED: 메인넷 클린 시작 — testnet(sandbox) 사용자/거래 데이터 전면 초기화.
--   배경: 운영DB는 2026-06-28 dev(sandbox) 100% 미러로 구성됨. sandbox pi_uid는
--         메인넷에서 무효라, 메인넷 로그인 시 새 행이 생기며 기존 연동/데이터와 분리됨
--         (anakin2/3에서 재현 확인: testnet uid 673434…/938ef5… vs mainnet uid 6789d9…/cec5b1…).
--   결정: 2026-06-30 마스터 — testnet 데이터는 가치 없어 백업 없이 전면 초기화(클린 시작).
--   물리 TRUNCATE 사유: 논리삭제가 아닌 완전 초기화(메인넷 정식 오픈 전 1회성).
--   보존: 마스터/설정/카탈로그/다국어/표준/권한 데이터는 건드리지 않음(아래 array에서 제외).
--
--   ⚙️ FK 처리: 운영DB엔 FK 62개 존재(pg_dump 미러로 유입). 초기화 대상을 참조하는 자식이
--      모두 대상 array에 포함되도록 FK 분석으로 검증(brd_cmnt·msg_attch·msg_msg_reac·
--      msg_webhook·evt_gift_log·msg_usr_badge 추가). 단일 TRUNCATE 문으로 동시 비움 →
--      CASCADE 없이 통과(보존 테이블 오삭제 방지). "WIPE 밖→WIPE 참조 FK" 0 확인.
--
-- ⚠️ 운영(prod) 전용. dev/staging에는 적용하지 말 것(개발 데이터 보존 필요).
-- ⚠️ 적용 후: 모든 사용자(마스터 포함)는 메인넷에서 재가입·재연동해야 한다.
--    마스터 계정은 재가입 후 role 승격 필요: UPDATE sys_user SET role='MASTER' WHERE pi_username='<...>';

BEGIN;

DO $$
DECLARE
  t       text;
  present text[] := '{}';
  -- 초기화 대상 = testnet 사용자/거래 데이터. (마스터/설정/카탈로그는 의도적으로 제외)
  tbls text[] := array[
    -- 계정/세션/연동/배지
    'sys_user', 'sys_user_consent', 'sys_user_actvty_log', 'auth_link_cd', 'msg_usr_badge',
    -- 카페/메시지/첨부/리액션/번역/알림/구독/웹훅
    'msg_room', 'msg_msg', 'msg_attch', 'msg_msg_reac', 'msg_room_mbr', 'msg_trans',
    'msg_noti', 'msg_noti_outbox', 'msg_subscr', 'msg_usr_stkr', 'msg_theme_follow',
    'msg_tip', 'msg_webhook',
    -- 통화(음성/영상)
    'msg_call_log', 'msg_call_participant', 'msg_call_quality_stat',
    -- 베팅(레거시 잔재)
    'msg_bet', 'msg_bet_optn', 'msg_bet_entry',
    -- Bean 지갑/거래/캠페인/발행
    'bean_wlt', 'bean_txn', 'bean_subscr', 'bean_campaign',
    'bean_campaign_grant', 'bean_mint_log', 'bean_token_wallet',
    -- 상점/상품/주문/정산/장바구니
    'mps_shop', 'mps_item', 'mps_item_img', 'mps_order', 'mps_order_item',
    'mps_txn_hist', 'mps_seller_bond', 'mps_cart',
    -- 결제
    'pi_pymnt',
    -- 후기(사용자 작성)
    'fbck_mst', 'fbck_img', 'fbck_item_scr',
    -- 이벤트 참여/선물(정의 evt_mission·evt_event는 보존)
    'evt_user_mission', 'evt_exclude', 'evt_pi_reward_log', 'evt_action_log', 'evt_gift_log',
    -- 위치 이력
    'usr_loc_hist',
    -- 통계/메트릭/배치 로그(testnet 집계)
    'stat_pageview', 'stat_actvty_dly', 'stat_revenue_dly',
    'sys_metric_req_perf', 'sys_batch_log',
    -- 게시판 글/댓글/첨부(카테고리 brd_ctgr는 보존)
    'brd_post', 'brd_cmnt', 'brd_attch'
  ];
BEGIN
  -- 존재하는 테이블만 모아 단일 TRUNCATE 문으로 동시 초기화(FK 상호참조 통과)
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      present := present || ('public.' || quote_ident(t));
    ELSE
      RAISE NOTICE 'skip (not found): %', t;
    END IF;
  END LOOP;

  IF array_length(present, 1) > 0 THEN
    RAISE NOTICE 'truncating % tables: %', array_length(present, 1), array_to_string(present, ', ');
    EXECUTE 'TRUNCATE TABLE ' || array_to_string(present, ', ') || ' RESTART IDENTITY';
  END IF;
END $$;

COMMIT;

-- 검증(수동): 0건 기대 — select count(*) from sys_user; / pi_pymnt; / bean_txn;
-- 보존 확인(>0 기대): bean_fee_plan, mps_ctgr, msg_theme, brd_ctgr, i18n_message
