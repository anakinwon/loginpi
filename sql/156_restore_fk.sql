-- DA-APPROVED: FK 재생성 — sql/155 FK 일괄 제거가 PostgREST 임베디드 조인(FK 관계 의존)을
--   깨뜨려 카페/매장/상품 목록 조회 장애(PGRST200) 발생. 긴급 복구 (2026-07-01).
--   NOT VALID: 기존 데이터 검증 없이 관계 메타데이터만 복원 → 고아 데이터 무관하게 성공,
--   PostgREST가 FK 관계를 재인식하여 .select('t(...)') 임베디드 조인 복구.
--   ⚠️ 무FK 원칙은 코드(임베디드 조인 다수)와 충돌 — 별도 재논의 필요.

ALTER TABLE auth_link_cd ADD CONSTRAINT auth_link_cd_sys_user_id_fkey FOREIGN KEY (pi_user_id) REFERENCES sys_user(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE bean_campaign_grant ADD CONSTRAINT bean_campaign_grant_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES mps_shop(shop_id) NOT VALID;
ALTER TABLE brd_attch ADD CONSTRAINT fk_brd_attch_post FOREIGN KEY (post_id) REFERENCES brd_post(post_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE brd_cmnt ADD CONSTRAINT fk_brd_cmnt_post FOREIGN KEY (post_id) REFERENCES brd_post(post_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE brd_post ADD CONSTRAINT fk_brd_post_ctgr FOREIGN KEY (ctgr_cd) REFERENCES brd_ctgr(ctgr_cd) NOT VALID;
ALTER TABLE evt_action_log ADD CONSTRAINT evt_action_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES sys_user(id) NOT VALID;
ALTER TABLE evt_exclude ADD CONSTRAINT evt_exclude_event_id_fkey FOREIGN KEY (event_id) REFERENCES evt_event(event_id) NOT VALID;
ALTER TABLE evt_exclude ADD CONSTRAINT evt_exclude_user_id_fkey FOREIGN KEY (user_id) REFERENCES sys_user(id) NOT VALID;
ALTER TABLE evt_gift_log ADD CONSTRAINT evt_gift_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES evt_event(event_id) NOT VALID;
ALTER TABLE evt_gift_log ADD CONSTRAINT evt_gift_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES sys_user(id) NOT VALID;
ALTER TABLE evt_mission ADD CONSTRAINT evt_mission_event_id_fkey FOREIGN KEY (event_id) REFERENCES evt_event(event_id) NOT VALID;
ALTER TABLE evt_pi_reward_log ADD CONSTRAINT evt_pi_reward_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES evt_event(event_id) NOT VALID;
ALTER TABLE evt_pi_reward_log ADD CONSTRAINT evt_pi_reward_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES sys_user(id) NOT VALID;
ALTER TABLE evt_user_mission ADD CONSTRAINT evt_user_mission_event_id_fkey FOREIGN KEY (event_id) REFERENCES evt_event(event_id) NOT VALID;
ALTER TABLE evt_user_mission ADD CONSTRAINT evt_user_mission_user_id_fkey FOREIGN KEY (user_id) REFERENCES sys_user(id) NOT VALID;
ALTER TABLE i18n_cntry_mst ADD CONSTRAINT fk_i18n_cntry_locale FOREIGN KEY (locale_cd) REFERENCES i18n_lang_mst(lang_cd) ON DELETE SET NULL NOT VALID;
ALTER TABLE i18n_message ADD CONSTRAINT i18n_message_locale_cd_fkey FOREIGN KEY (locale_cd) REFERENCES i18n_locale(locale_cd) NOT VALID;
ALTER TABLE mps_ctgr ADD CONSTRAINT mps_ctgr_parent_ctgr_id_fkey FOREIGN KEY (parent_ctgr_id) REFERENCES mps_ctgr(ctgr_id) NOT VALID;
ALTER TABLE mps_item ADD CONSTRAINT mps_item_ctgr_id_fkey FOREIGN KEY (ctgr_id) REFERENCES mps_ctgr(ctgr_id) NOT VALID;
ALTER TABLE mps_item ADD CONSTRAINT mps_item_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES mps_shop(shop_id) NOT VALID;
ALTER TABLE mps_item_img ADD CONSTRAINT mps_item_img_item_id_fkey FOREIGN KEY (item_id) REFERENCES mps_item(item_id) NOT VALID;
ALTER TABLE mps_order ADD CONSTRAINT mps_order_item_id_fkey FOREIGN KEY (item_id) REFERENCES mps_item(item_id) NOT VALID;
ALTER TABLE mps_order ADD CONSTRAINT mps_order_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES mps_shop(shop_id) NOT VALID;
ALTER TABLE mps_order_item ADD CONSTRAINT mps_order_item_item_id_fkey FOREIGN KEY (item_id) REFERENCES mps_item(item_id) NOT VALID;
ALTER TABLE mps_order_item ADD CONSTRAINT mps_order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES mps_order(order_id) NOT VALID;
ALTER TABLE mps_txn_hist ADD CONSTRAINT mps_txn_hist_order_id_fkey FOREIGN KEY (order_id) REFERENCES mps_order(order_id) NOT VALID;
ALTER TABLE msg_attch ADD CONSTRAINT msg_attch_msg_id_fkey FOREIGN KEY (msg_id) REFERENCES msg_msg(msg_id) NOT VALID;
ALTER TABLE msg_bet ADD CONSTRAINT msg_bet_room_id_fkey FOREIGN KEY (room_id) REFERENCES msg_room(room_id) NOT VALID;
ALTER TABLE msg_bet_entry ADD CONSTRAINT msg_bet_entry_bet_id_fkey FOREIGN KEY (bet_id) REFERENCES msg_bet(bet_id) NOT VALID;
ALTER TABLE msg_bet_entry ADD CONSTRAINT msg_bet_entry_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt(payment_id) NOT VALID;
ALTER TABLE msg_bet_optn ADD CONSTRAINT msg_bet_optn_bet_id_fkey FOREIGN KEY (bet_id) REFERENCES msg_bet(bet_id) NOT VALID;
ALTER TABLE msg_call_log ADD CONSTRAINT msg_call_log_room_id_fkey FOREIGN KEY (room_id) REFERENCES msg_room(room_id) NOT VALID;
ALTER TABLE msg_call_participant ADD CONSTRAINT msg_call_participant_room_id_fkey FOREIGN KEY (room_id) REFERENCES msg_room(room_id) NOT VALID;
ALTER TABLE msg_call_participant ADD CONSTRAINT msg_call_participant_usr_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user(id) NOT VALID;
ALTER TABLE msg_call_quality_stat ADD CONSTRAINT msg_call_quality_stat_call_id_fkey FOREIGN KEY (call_id) REFERENCES msg_call_log(call_id) NOT VALID;
ALTER TABLE msg_call_quality_stat ADD CONSTRAINT msg_call_quality_stat_room_id_fkey FOREIGN KEY (room_id) REFERENCES msg_room(room_id) NOT VALID;
ALTER TABLE msg_msg ADD CONSTRAINT msg_msg_room_id_fkey FOREIGN KEY (room_id) REFERENCES msg_room(room_id) NOT VALID;
ALTER TABLE msg_msg_reac ADD CONSTRAINT msg_msg_reac_msg_id_fkey FOREIGN KEY (msg_id) REFERENCES msg_msg(msg_id) NOT VALID;
ALTER TABLE msg_noti_outbox ADD CONSTRAINT msg_noti_outbox_order_id_fkey FOREIGN KEY (order_id) REFERENCES mps_order(order_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE msg_noti_outbox ADD CONSTRAINT msg_noti_outbox_recv_usr_id_fkey FOREIGN KEY (recv_usr_id) REFERENCES sys_user(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE msg_room ADD CONSTRAINT msg_room_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt(payment_id) NOT VALID;
ALTER TABLE msg_room ADD CONSTRAINT msg_room_theme_cd_fkey FOREIGN KEY (theme_cd) REFERENCES msg_theme(theme_cd) NOT VALID;
ALTER TABLE msg_room_mbr ADD CONSTRAINT msg_room_mbr_room_id_fkey FOREIGN KEY (room_id) REFERENCES msg_room(room_id) NOT VALID;
ALTER TABLE msg_stkr ADD CONSTRAINT msg_stkr_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES msg_stkr_pack(pack_id) NOT VALID;
ALTER TABLE msg_stkr_pack ADD CONSTRAINT msg_stkr_pack_theme_cd_fkey FOREIGN KEY (theme_cd) REFERENCES msg_theme(theme_cd) NOT VALID;
ALTER TABLE msg_subscr ADD CONSTRAINT msg_subscr_plan_cd_fkey FOREIGN KEY (plan_cd) REFERENCES msg_subscr_plan(plan_cd) NOT VALID;
ALTER TABLE msg_subscr ADD CONSTRAINT msg_subscr_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt(payment_id) NOT VALID;
ALTER TABLE msg_theme_follow ADD CONSTRAINT msg_theme_follow_theme_cd_fkey FOREIGN KEY (theme_cd) REFERENCES msg_theme(theme_cd) NOT VALID;
ALTER TABLE msg_theme_stkr ADD CONSTRAINT msg_theme_stkr_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES msg_stkr_pack(pack_id) NOT VALID;
ALTER TABLE msg_theme_stkr ADD CONSTRAINT msg_theme_stkr_theme_cd_fkey FOREIGN KEY (theme_cd) REFERENCES msg_theme(theme_cd) NOT VALID;
ALTER TABLE msg_tip ADD CONSTRAINT msg_tip_msg_id_fkey FOREIGN KEY (msg_id) REFERENCES msg_msg(msg_id) NOT VALID;
ALTER TABLE msg_tip ADD CONSTRAINT msg_tip_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt(payment_id) NOT VALID;
ALTER TABLE msg_tip ADD CONSTRAINT msg_tip_room_id_fkey FOREIGN KEY (room_id) REFERENCES msg_room(room_id) NOT VALID;
ALTER TABLE msg_trans ADD CONSTRAINT msg_trans_msg_id_fkey FOREIGN KEY (msg_id) REFERENCES msg_msg(msg_id) NOT VALID;
ALTER TABLE msg_usr_badge ADD CONSTRAINT msg_usr_badge_theme_cd_fkey FOREIGN KEY (theme_cd) REFERENCES msg_theme(theme_cd) NOT VALID;
ALTER TABLE msg_usr_badge ADD CONSTRAINT msg_usr_badge_usr_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user(id) NOT VALID;
ALTER TABLE msg_usr_stkr ADD CONSTRAINT msg_usr_stkr_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES msg_stkr_pack(pack_id) NOT VALID;
ALTER TABLE msg_usr_stkr ADD CONSTRAINT msg_usr_stkr_pymnt_id_fkey FOREIGN KEY (pymnt_id) REFERENCES pi_pymnt(payment_id) NOT VALID;
ALTER TABLE msg_webhook ADD CONSTRAINT msg_webhook_room_id_fkey FOREIGN KEY (room_id) REFERENCES msg_room(room_id) NOT VALID;
ALTER TABLE pi_pymnt ADD CONSTRAINT pi_pymnt_sys_user_id_fkey FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE sys_user ADD CONSTRAINT sys_user_rep_shop_id_fkey FOREIGN KEY (rep_shop_id) REFERENCES mps_shop(shop_id) NOT VALID;
ALTER TABLE sys_user_actvty_log ADD CONSTRAINT sys_user_actvty_log_usr_id_fkey FOREIGN KEY (usr_id) REFERENCES sys_user(id) NOT VALID;

-- PostgREST 스키마 캐시 즉시 리로드 → FK 관계 재인식
NOTIFY pgrst, 'reload schema';
