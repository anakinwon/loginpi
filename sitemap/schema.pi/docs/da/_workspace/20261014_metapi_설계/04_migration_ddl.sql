-- ============================================================================
-- 04_migration_ddl.sql — 표준사전 5테이블 cafe.pi → METAPI(schema.pi) 이관 SQL 세트
-- 대상 : std_dic · std_dom · std_term · approval_queue · std_audit_log
-- 용도 : 이관 계획서 04_migration_plan.md 의 실행 SQL. 운영 적용은 마스터만 수행한다(에이전트 적용 금지).
-- 확정 후 이동처 : M1 → sitemap/schema.pi/sql/NNN_std_migration.sql (db-migrate.mjs --app schema 로 적용)
--                 M4 → 그 다음 순번 별도 파일(데이터 적재·대사 뒤에 투입) → 그 뒤 02_modeler_ddl.sql 순번 파일 투입
--                 C1·C2 → cafe.pi sql/NNN_std_freeze.sql (새 순번, 마스터 채번)
-- 전제 : packages/pi-db/sql/000_baseline.sql 적용 완료(fn_grant_svc_only 사용).
-- 실행 위치 표기 : [원천] = cafe.pi DB public / [대상] = schema.pi DB (dev=schema_dev · stg=schema_stg · prod=public)
-- 접속 : Supabase Session pooler(aws-1-ap-northeast-2)만 사용. 직접연결 DNS 폐지.
-- 멱등 : IF NOT EXISTS · CREATE OR REPLACE · ON CONFLICT 업서트 · 존재 검사 후 실행. 재실행 안전, 물리삭제 0.
-- Hook 경고(표준도메인 미종결 21건)는 승계 컬럼명 — 이관 중 이름 변경 0 원칙으로 유지, 후속 순번에서 정비(계획서 §2-3).
-- ============================================================================


-- ============================================================================
-- S0. [원천] 사전 실측 — 조회 전용. 결과를 잡 디렉토리 evidence 로 보관하고 M1 타입과 대조한다.
--     원천 CREATE 문이 저장소에 없다(004 이전 외부 생성). 타입·기본값·제약은 이 결과가 정본.
-- ============================================================================

-- S0-0. [원천] PostgREST OpenAPI 컬럼 목록 게이트 (리더 지시 2026-10-14 — 1차 M1 이 API 역추적만으로 std_dic 6컬럼·req_at 을 놓친 사고 재발 방지)
--   통과 조건 : ① OpenAPI 정의 ② S0-1 카탈로그 컬럼명 ③ M2 load() 컬럼 목록 — 세 목록의 "테이블.컬럼" diff 0.
--   ③ 은 승계 컬럼만 담는다(소급 컬럼 제외). 하나라도 어긋나면 M1·M2·V2 를 고친 뒤 다시 돈다.
--   SB_URL·SB_KEY(service_role) 는 셸 변수로만 둔다.
-- node -e "fetch(process.env.SB_URL+'/rest/v1/',{headers:{apikey:process.env.SB_KEY,Authorization:'Bearer '+process.env.SB_KEY}}).then(r=>r.json()).then(j=>{for(const t of ['std_dic','std_dom','std_term','approval_queue','std_audit_log'])for(const c of Object.keys(j.definitions[t].properties))console.log(t+'.'+c)})" | tr -d '\r' | sort > openapi_cols.txt
-- psql "$SRC_URL" -Atc "SELECT c.relname||'.'||a.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE c.relname IN ('std_dic','std_dom','std_term','approval_queue','std_audit_log')" | tr -d '\r' | sort > catalog_cols.txt
-- grep -E '^-- load [a-z_]+ ' 04_migration_ddl.sql | sed -E 's/^-- load ([a-z_]+) +[a-z_]+ +"([^"]+)".*/ /' | while read t cols; do for c in ${cols//,/ }; do echo "$t.$c"; done; done | tr -d '\r' | sort > m2_cols.txt
-- diff openapi_cols.txt catalog_cols.txt && diff catalog_cols.txt m2_cols.txt && echo "S0-0 PASS"

-- S0-1. 컬럼 타입·NULL·기본값 (M1 과 1:1 대조 — 불일치 1건이라도 있으면 M1 수정 후 진행)
SELECT c.relname                              AS tbl_nm
     , a.attnum                               AS col_seq
     , a.attname                              AS col_nm
     , format_type(a.atttypid, a.atttypmod)   AS col_type
     , a.attnotnull                           AS not_null_yn
     , pg_get_expr(d.adbin, d.adrelid)        AS dflt_expr
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE c.relname IN ('std_dic','std_dom','std_term','approval_queue','std_audit_log')
ORDER BY c.relname, a.attnum;

-- S0-2. 제약(PK·UNIQUE·CHECK·FK) — 나가는 FK 와 들어오는 FK 모두. 들어오는 FK 가 있으면 동결·폐지 차단
SELECT conrelid::regclass          AS own_tbl
     , conname                     AS cnst_nm
     , contype                     AS cnst_type
     , pg_get_constraintdef(oid)   AS cnst_def
FROM pg_constraint
WHERE conrelid::regclass::text  IN ('std_dic','std_dom','std_term','approval_queue','std_audit_log')
   OR confrelid::regclass::text IN ('std_dic','std_dom','std_term','approval_queue','std_audit_log')
ORDER BY 1, 2;

-- S0-3. 인덱스·트리거 (M1 재현 대상 목록)
SELECT tablename AS tbl_nm, indexname AS idx_nm, indexdef AS idx_def
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('std_dic','std_dom','std_term','approval_queue','std_audit_log')
ORDER BY 1, 2;

SELECT event_object_table               AS tbl_nm
     , trigger_name                     AS trg_nm
     , action_timing                    AS trg_timing
     , string_agg(event_manipulation, ',') AS trg_event
     , action_statement                 AS trg_stmt
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('std_dic','std_dom','std_term','approval_queue','std_audit_log')
GROUP BY 1, 2, 3, 5
ORDER BY 1, 2;

-- S0-4. apv_id UUID 캐스팅 가능성 (M4 게이트). non_uuid_cnt = 0 이어야 전환 가능
SELECT count(*) AS tot_cnt
     , count(*) FILTER (WHERE apv_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')  AS uuid_cnt
     , count(*) FILTER (WHERE apv_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS non_uuid_cnt
     , count(*) FILTER (WHERE apv_id <> lower(apv_id))  AS upper_cnt
FROM public.approval_queue;

-- S0-5. 데이터 정책 점검 — Pi 식별자 키가 JSONB 에 섞였는지 (기대값 0). 0 이 아니면 이관 보류·리더 상신
SELECT 'std_audit_log' AS tbl_nm, count(*) AS susp_cnt
FROM public.std_audit_log
WHERE (coalesce(old_val::text, '') || coalesce(new_val::text, '')) ~* '(pi_username|pi_uid|pi_usr_nm|access_?token|accesstoken)'
UNION ALL
SELECT 'approval_queue', count(*)
FROM public.approval_queue
WHERE coalesce(req_data::text, '') ~* '(pi_username|pi_uid|pi_usr_nm|access_?token|accesstoken)';

-- S0-6. 작성자 컬럼 값 분포 — 'ADMIN' 또는 ADMIN 역할 sys_user.id 만이어야 한다(원천 안에서만 조인, 이관 안 함)
SELECT v.who AS wrtr_val, count(*) AS row_cnt, max(u.role) AS usr_role
FROM (
  SELECT regr_id AS who FROM public.std_dic  UNION ALL SELECT modr_id FROM public.std_dic
  UNION ALL SELECT regr_id FROM public.std_dom  UNION ALL SELECT modr_id FROM public.std_dom
  UNION ALL SELECT regr_id FROM public.std_term UNION ALL SELECT modr_id FROM public.std_term
  UNION ALL SELECT req_by  FROM public.approval_queue UNION ALL SELECT decided_by FROM public.approval_queue
  UNION ALL SELECT chgr_id FROM public.std_audit_log
) v
LEFT JOIN public.sys_user u ON u.id::text = v.who
GROUP BY v.who
ORDER BY 2 DESC;


-- ============================================================================
-- M1. [대상] 테이블·함수·트리거·인덱스 — 스키마 비한정(search_path = schema_dev|schema_stg|public)
--     컬럼은 원천 1:1 승계(이름 변경 0). 소급 추가 컬럼은 ★ 표기.
--     컬럼·NULL·기본값은 02 모델 §3(개발 DB OpenAPI) 기준. 운영 원천과의 차이는 S0-0·S0-1 게이트가 잡는다.
-- ============================================================================
BEGIN;

-- 컬럼 정의 정본 : 02_modeler_model.md §3 승계 5테이블(cafe.pi 개발 DB PostgREST OpenAPI 2026-10-14 기준) — 운영은 S0-0·S0-1 로 재확인.
-- 실 DB 의 NULL 허용·TEXT 여부(_yn 포함)는 그대로 승계한다(grandfathered). NOT NULL 을 임의로 강화하면 원천 NULL 행이 적재에서 실패한다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- 표준 3종 검색 trgm 인덱스(M1-6). Supabase 는 extensions 스키마에 설치될 수 있다 [확인중 : Supabase 문서]

-- M1-1. std_dic 표준단어 (승계 21 + 소급 1)
CREATE TABLE IF NOT EXISTS std_dic (
  dic_id               TEXT        NOT NULL,                       -- 기본값 없음(API 가 crypto.randomUUID() 공급)
  dic_log_nm           TEXT,                                       -- 실 DB NULL 허용
  dic_phy_nm           TEXT,                                       -- 실 DB NULL 허용
  dic_phy_fll_nm       TEXT,
  dic_desc             TEXT,
  dic_gbn_cd           TEXT,
  ent_clss_yn          TEXT,                                       -- grandfathered(_yn 인데 TEXT·CHECK 없음)
  attr_clss_yn         TEXT,                                       -- grandfathered
  dom_use_yn           TEXT,                                       -- grandfathered
  dom_id               TEXT,                                       -- 표준도메인 참조(FK 없음)
  data_type            TEXT,                                       -- grandfathered
  data_len             INTEGER,
  data_scale           INTEGER,                                    -- grandfathered
  stored_term_comp_ids TEXT,                                       -- grandfathered(다중값 1NF 위반 — 설계 재검토 대상)
  apv_status           TEXT        DEFAULT 'APPROVED'              -- 실 DB NULL 허용
                       CHECK (apv_status IN ('PENDING','APPROVED','REJECTED')),  -- [확인중 : S0-2 원천 CHECK 유무] 원천에 벗어난 값이 있으면 적재가 실패한다(의도된 게이트)
  synced_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,      -- grandfathered
  del_yn               CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm              TIMESTAMPTZ,                                -- ★ 소급(이관분 NULL)
  regr_id              TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id              TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT std_dic_pkey PRIMARY KEY (dic_id)
);

-- M1-2. std_dom 표준도메인 (승계 16 + 소급 1)
CREATE TABLE IF NOT EXISTS std_dom (
  dom_id          TEXT        NOT NULL,
  key_dom_nm      TEXT,                                            -- 실 DB NULL 허용
  key_dom_phy_nm  TEXT,                                            -- 실 DB NULL 허용
  dom_nm          TEXT,                                            -- 실 DB NULL 허용
  dom_type_cd     TEXT,
  data_type_cd    TEXT,
  data_len        INTEGER,
  data_scale      INTEGER,                                         -- grandfathered
  dom_desc        TEXT,
  apv_status      TEXT        NOT NULL DEFAULT 'APPROVED'
                  CHECK (apv_status IN ('PENDING','APPROVED','REJECTED')),  -- sql/010 정의 그대로
  synced_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,           -- grandfathered
  del_yn          CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,                                     -- ★ 소급
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT std_dom_pkey PRIMARY KEY (dom_id)
);

-- M1-3. std_term 표준용어 (승계 12 + 소급 1) — term_id 는 실 DB UUID
CREATE TABLE IF NOT EXISTS std_term (
  term_id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  term_log_nm     TEXT        NOT NULL,
  term_phy_nm     TEXT        NOT NULL,
  term_phy_fll_nm TEXT,
  term_desc       TEXT,
  apv_status      TEXT        NOT NULL DEFAULT 'APPROVED'
                  CHECK (apv_status IN ('PENDING','APPROVED','REJECTED')),  -- [확인중 : S0-2 원천 CHECK 유무]
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- grandfathered. 실 DB NOT NULL
  del_yn          CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),
  del_dtm         TIMESTAMPTZ,                                     -- ★ 소급
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT std_term_pkey PRIMARY KEY (term_id)
);

-- M1-4. approval_queue 승인 대기열 (승계 15 + 소급 2) — apv_id 는 TEXT 로 적재 후 M4 게이트 통과 시 UUID 전환
CREATE TABLE IF NOT EXISTS approval_queue (
  apv_id          TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,  -- sql/010 기본값
  entity_type     TEXT        NOT NULL,                            -- grandfathered. 'STD_DIC'|'STD_DOM'|'STD_TERM'
  entity_id       TEXT        NOT NULL,                            -- 다형 참조(FK 불가·임베디드 조인 비대상)
  entity_nm       TEXT,
  apv_status      TEXT        NOT NULL DEFAULT 'PENDING'
                  CHECK (apv_status IN ('PENDING','APPROVED','REJECTED')),  -- sql/010 정의 그대로
  req_data        JSONB,                                           -- grandfathered
  req_by          TEXT,                                            -- grandfathered
  req_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,           -- grandfathered(_at). API 미사용이라 1차 역추적에서 누락됐던 실 DB 컬럼
  decided_by      TEXT,                                            -- grandfathered
  decided_at      TIMESTAMPTZ,                                     -- grandfathered
  reject_reason   TEXT,                                            -- grandfathered
  del_yn          CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N')),  -- ★ 소급(전건 'N')
  del_dtm         TIMESTAMPTZ,                                     -- ★ 소급
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT approval_queue_pkey PRIMARY KEY (apv_id)              -- [확인중 : S0-2 원천 PK 제약명]
);

-- M1-5. std_audit_log 표준사전 감사 로그 (승계 8 + 소급 4) — del_yn·del_dtm 은 _log 면제(R6)라 두지 않는다
CREATE TABLE IF NOT EXISTS std_audit_log (
  log_id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  tgt_tbl         TEXT        NOT NULL,                            -- grandfathered. 감사 대상 테이블명
  tgt_id          TEXT        NOT NULL,
  action_cd       TEXT        NOT NULL CHECK (action_cd IN ('INSERT','UPDATE','DELETE')),
  old_val         JSONB,
  new_val         JSONB,
  chgr_id         TEXT        NOT NULL DEFAULT 'ADMIN',            -- 업무 감사 데이터(변경자)
  chg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- 업무 감사 데이터(변경 시각)
  regr_id         TEXT        NOT NULL DEFAULT 'ADMIN',            -- ★ 소급(M3 에서 chgr_id 로 백필)
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- ★ 소급(M3 에서 chg_dtm 로 백필)
  modr_id         TEXT        NOT NULL DEFAULT 'ADMIN',            -- ★ 소급(M3 에서 chgr_id 로 백필)
  mod_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- ★ 소급(M3 에서 chg_dtm 로 백필)
  CONSTRAINT std_audit_log_pkey PRIMARY KEY (log_id)
);
-- mod_dtm 트리거 없음 : append-only 감사 테이블 예외(정본 §6, sql/176 동일).

-- M1-6. 인덱스 — 승계 4개는 표준 이름으로(02 모델 요청 ③), 표준 3종 검색 trgm 부분 인덱스 8개 신설(02 모델 요청 ②)
CREATE INDEX IF NOT EXISTS idx_std_audit_log_tgt_tbl_chg_dtm ON std_audit_log (tgt_tbl, chg_dtm DESC);
CREATE INDEX IF NOT EXISTS idx_std_audit_log_tgt_id          ON std_audit_log (tgt_id);
CREATE INDEX IF NOT EXISTS idx_approval_queue_apv_status     ON approval_queue (apv_status, reg_dtm DESC) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_approval_queue_entity_id      ON approval_queue (entity_type, entity_id)   WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_dic_dic_log_nm_trgm       ON std_dic  USING gin (dic_log_nm gin_trgm_ops)     WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_dic_dic_phy_nm_trgm       ON std_dic  USING gin (dic_phy_nm gin_trgm_ops)     WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_dic_dic_phy_fll_nm_trgm   ON std_dic  USING gin (dic_phy_fll_nm gin_trgm_ops) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_dom_dom_nm_trgm           ON std_dom  USING gin (dom_nm gin_trgm_ops)         WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_dom_key_dom_nm_trgm       ON std_dom  USING gin (key_dom_nm gin_trgm_ops)     WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_dom_key_dom_phy_nm_trgm   ON std_dom  USING gin (key_dom_phy_nm gin_trgm_ops) WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_term_term_log_nm_trgm     ON std_term USING gin (term_log_nm gin_trgm_ops)    WHERE del_yn = 'N';
CREATE INDEX IF NOT EXISTS idx_std_term_term_phy_nm_trgm     ON std_term USING gin (term_phy_nm gin_trgm_ops)    WHERE del_yn = 'N';

-- M1-7. mod_dtm 자동 갱신 — 원천 NOW() → CURRENT_TIMESTAMP. 함수명 원천 승계 + approval_queue 신설(02 모델 §4)
CREATE OR REPLACE FUNCTION fn_upd_std_dic_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN NEW.mod_dtm := CURRENT_TIMESTAMP; RETURN NEW; END;
$$;
CREATE OR REPLACE FUNCTION fn_upd_std_dom_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN NEW.mod_dtm := CURRENT_TIMESTAMP; RETURN NEW; END;
$$;
CREATE OR REPLACE FUNCTION fn_upd_std_term_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN NEW.mod_dtm := CURRENT_TIMESTAMP; RETURN NEW; END;
$$;
CREATE OR REPLACE FUNCTION fn_upd_approval_queue_mod_dtm()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN NEW.mod_dtm := CURRENT_TIMESTAMP; RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_std_dic_mod_dtm        BEFORE UPDATE ON std_dic        FOR EACH ROW EXECUTE FUNCTION fn_upd_std_dic_mod_dtm();
CREATE OR REPLACE TRIGGER trg_std_dom_mod_dtm        BEFORE UPDATE ON std_dom        FOR EACH ROW EXECUTE FUNCTION fn_upd_std_dom_mod_dtm();
CREATE OR REPLACE TRIGGER trg_std_term_mod_dtm       BEFORE UPDATE ON std_term       FOR EACH ROW EXECUTE FUNCTION fn_upd_std_term_mod_dtm();
CREATE OR REPLACE TRIGGER trg_approval_queue_mod_dtm BEFORE UPDATE ON approval_queue FOR EACH ROW EXECUTE FUNCTION fn_upd_approval_queue_mod_dtm();

-- M1-8. 감사 트리거 — 원천에서 두 가지를 바꾼다.
--   ① INSERT 대상 : public.std_audit_log 하드코딩 → TG_TABLE_SCHEMA 동적(tier 마다 스키마가 다름)
--   ② PK 추출 : 구 sql/009 COALESCE(dic_id·dom_id·term_id) → TG_TABLE_NAME 별 매핑(02 모델 요청 ①).
--      cod_group.term_id 처럼 다른 PK 와 이름이 같은 컬럼이 있으면 COALESCE 가 PK 를 잘못 뽑는다.
--      미매핑 테이블은 v_id NULL → tgt_id NOT NULL 위반으로 실패한다(조용한 오기록보다 큰 실패가 낫다).
CREATE OR REPLACE FUNCTION fn_std_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_new JSONB;
  v_old JSONB;
  v_pk  TEXT;
  v_id  TEXT;
  v_who TEXT;
BEGIN
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_pk  := CASE TG_TABLE_NAME
             WHEN 'std_dic'   THEN 'dic_id'
             WHEN 'std_dom'   THEN 'dom_id'
             WHEN 'std_term'  THEN 'term_id'
             WHEN 'cod_group' THEN 'cd_group_id'
             WHEN 'cod_val'   THEN 'cd_val_id'
           END;
  v_id  := COALESCE(v_new->>v_pk, v_old->>v_pk);
  v_who := COALESCE(CASE WHEN TG_OP = 'DELETE' THEN v_old->>'modr_id' ELSE v_new->>'modr_id' END, 'ADMIN');

  EXECUTE format(
    'INSERT INTO %I.std_audit_log (tgt_tbl, tgt_id, action_cd, old_val, new_val, chgr_id, regr_id, modr_id)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $6)', TG_TABLE_SCHEMA)
  USING TG_TABLE_NAME, v_id, TG_OP, v_old, v_new, v_who;

  RETURN NULL;  -- AFTER 트리거 반환값은 무시된다
END;
$$;

CREATE OR REPLACE TRIGGER trg_std_dic_audit  AFTER INSERT OR UPDATE OR DELETE ON std_dic  FOR EACH ROW EXECUTE FUNCTION fn_std_audit_log();
CREATE OR REPLACE TRIGGER trg_std_dom_audit  AFTER INSERT OR UPDATE OR DELETE ON std_dom  FOR EACH ROW EXECUTE FUNCTION fn_std_audit_log();
CREATE OR REPLACE TRIGGER trg_std_term_audit AFTER INSERT OR UPDATE OR DELETE ON std_term FOR EACH ROW EXECUTE FUNCTION fn_std_audit_log();

-- M1-9. 권한 — baseline 공용 함수 재사용(RLS 비활성 + anon/authenticated 회수 + service_role 부여)
SELECT fn_grant_svc_only('TABLE', 'std_dic');
SELECT fn_grant_svc_only('TABLE', 'std_dom');
SELECT fn_grant_svc_only('TABLE', 'std_term');
SELECT fn_grant_svc_only('TABLE', 'approval_queue');
SELECT fn_grant_svc_only('TABLE', 'std_audit_log');
SELECT fn_grant_svc_only('FUNCTION', 'fn_upd_std_dic_mod_dtm()');
SELECT fn_grant_svc_only('FUNCTION', 'fn_upd_std_dom_mod_dtm()');
SELECT fn_grant_svc_only('FUNCTION', 'fn_upd_std_term_mod_dtm()');
SELECT fn_grant_svc_only('FUNCTION', 'fn_upd_approval_queue_mod_dtm()');
SELECT fn_grant_svc_only('FUNCTION', 'fn_std_audit_log()');

COMMIT;


-- ============================================================================
-- M2. [원천→대상] 데이터 적재 — psql 메타명령(Bash, 마스터 실행). SQL 편집기에서는 실행 불가.
--     방식 : 원천 \copy(binary) → 대상 세션 임시테이블 → ON CONFLICT(PK) 업서트.
--     · session_replication_role=replica 로 트리거를 끈다 → 적재 중 감사 로그 중복 생성·mod_dtm 덮어쓰기 0.
--     · 업서트라 리허설·본적재 반복 실행이 안전하고, 대상 행을 지우는 단계가 없다(물리삭제 0).
--     · 원천에서 사라진 행(std_audit_log 365일 purge)은 대상에 남는다 → V1 건수 대사에서 드러난다.
--       이를 막으려고 리허설 시작~컷오버 동안 std_audit_log purge 를 정지한다(계획서 컷오버 체크리스트).
--     · 컬럼 목록 명시 → 원천·대상 컬럼 순서 차이와 소급 컬럼을 흡수한다.
-- ============================================================================
-- 셸 변수 SRC_URL·TGT_URL 은 셸에만 둔다(파일·로그 기록 금지). TGT_SCHEMA = schema_dev | schema_stg | public
-- WORK_DIR = 저장소 밖 임시 폴더(적재 후 삭제). 파일 경유 이유 : Windows 표준입출력 파이프는 텍스트 모드라
--   binary COPY 스트림이 깨진다("unexpected EOF in COPY data", 2026-10-14 로컬 리허설 실측). \copy 파일 모드는 바이너리로 연다.
-- 테이블 1개 = 대상 트랜잭션 1개(-1). 실패하면 그 테이블은 0건 반영으로 롤백되고 루프가 멈춘다(&& 체인).
--
-- load() {  # $1=테이블 $2=PK $3=컬럼목록 [$4=원천 SELECT 식, 생략 시 $3 — M4 뒤 approval_queue 재적재는 apv_id::uuid]
--   t="$1"; pk="$2"; cols="$3"; sel="${4:-$3}"; f="$WORK_DIR/$t.bin"
--   ex=$(printf '%s' "$cols" | sed -E 's/([a-z_]+)/EXCLUDED.\1/g')
--   psql "$SRC_URL" -v ON_ERROR_STOP=1 -c "\copy (SELECT $sel FROM public.$t ORDER BY $pk) TO '$f' WITH (FORMAT binary)" || return 1
--   psql "$TGT_URL" -v ON_ERROR_STOP=1 -1 \
--       -c "SET session_replication_role = replica" \
--       -c "SET search_path TO $TGT_SCHEMA" \
--       -c "CREATE TEMP TABLE tmp_load ON COMMIT DROP AS SELECT $cols FROM $t WITH NO DATA" \
--       -c "\copy tmp_load ($cols) FROM '$f' WITH (FORMAT binary)" \
--       -c "INSERT INTO $t ($cols) SELECT $cols FROM tmp_load ON CONFLICT ($pk) DO UPDATE SET ($cols) = ROW($ex)" || return 1
--   echo "OK $t"
-- }
-- load std_dom        dom_id  "dom_id, key_dom_nm, key_dom_phy_nm, dom_nm, dom_type_cd, data_type_cd, data_len, data_scale, dom_desc, apv_status, synced_at, del_yn, regr_id, reg_dtm, modr_id, mod_dtm" &&
-- load std_dic        dic_id  "dic_id, dic_log_nm, dic_phy_nm, dic_phy_fll_nm, dic_desc, dic_gbn_cd, ent_clss_yn, attr_clss_yn, dom_use_yn, dom_id, data_type, data_len, data_scale, stored_term_comp_ids, apv_status, synced_at, del_yn, regr_id, reg_dtm, modr_id, mod_dtm" &&
-- load std_term       term_id "term_id, term_log_nm, term_phy_nm, term_phy_fll_nm, term_desc, apv_status, synced_at, del_yn, regr_id, reg_dtm, modr_id, mod_dtm" &&
-- load approval_queue apv_id  "apv_id, entity_type, entity_id, entity_nm, apv_status, req_data, req_by, req_at, decided_by, decided_at, reject_reason, regr_id, reg_dtm, modr_id, mod_dtm" &&
-- load std_audit_log  log_id  "log_id, tgt_tbl, tgt_id, action_cd, old_val, new_val, chgr_id, chg_dtm" &&
-- echo "M2 전량 완료" || echo "M2 중단 — 실패 테이블 이후 미적재, 원인 확인 후 재실행(업서트라 안전)"
--
-- ※ FORMAT binary 는 원천·대상 컬럼 타입이 정확히 같아야 성공한다 → S0-1 대조 누락을 적재 단계에서 한 번 더 잡는다.
--   M4 적용 뒤(apv_id=UUID) 재적재하면 approval_queue 는 binary 가 실패한다 → 재적재는 M4 전에 끝내거나,
--   그 테이블만 4번째 인자로 원천 SELECT 식을 넘긴다 : load approval_queue apv_id "<컬럼목록>" "apv_id::uuid, entity_type, …(나머지 동일)"
-- ※ 순서는 의미상 부모→자식(도메인→단어→용어→승인→감사). FK 가 없어 순서 의존은 없지만 대사 보고 순서를 고정한다.


-- ============================================================================
-- M3. [대상] 소급 백필 — 원천 실재 값에서만 파생(임의값 생성 0). 재실행 안전(이미 같으면 0건)
-- ============================================================================
UPDATE std_audit_log
   SET regr_id = chgr_id, reg_dtm = chg_dtm, modr_id = chgr_id, mod_dtm = chg_dtm
 WHERE regr_id IS DISTINCT FROM chgr_id OR reg_dtm IS DISTINCT FROM chg_dtm
    OR modr_id IS DISTINCT FROM chgr_id OR mod_dtm IS DISTINCT FROM chg_dtm;
-- del_dtm(std_dic·std_dom·std_term·approval_queue) 이관분은 NULL 유지(리더 판정 2026-10-14) —
-- 원천에 삭제일시가 없고, mod_dtm 근사 백필은 삭제 이후 수정과 구분되지 않아 감사 추적을 왜곡한다.


-- ============================================================================
-- M3-opt. [대상] 작성자 운영자 UUID → 'ADMIN' 치환 — ⛔ 기본 미실행(리더 판정 2026-10-14 : 원값 유지)
--   실행 조건 : legal-compliance-advisor 가 "운영자 UUID 이전 = 교차 금지 조항 해당"으로 판정하고 마스터가 승인할 때만.
--   순서 : V1~V5 대사·M4 뒤에 실행(작성자 컬럼이 V2 체크섬에 들어가므로 치환 뒤에는 원천과 체크섬이 달라진다 — 정상).
--   대상 값 : UUID 형식 값만('ADMIN' 등 다른 값은 그대로). JSONB 스냅샷의 regr_id·modr_id 키도 같은 기준으로 치환.
--   replica 로 트리거를 끈다 → 치환이 감사 로그를 새로 만들거나 mod_dtm 을 바꾸지 않는다.
--   롤백 : R-opt (원천이 원값을 그대로 보관하므로 원천에서 되읽어 복원 — 별도 백업 테이블 불필요)
-- ============================================================================
-- BEGIN;
-- SET LOCAL session_replication_role = replica;
-- DO $$
-- DECLARE
--   re CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--   r  RECORD;
-- BEGIN
--   FOR r IN SELECT * FROM (VALUES
--     ('std_dic','regr_id'), ('std_dic','modr_id'), ('std_dom','regr_id'), ('std_dom','modr_id'),
--     ('std_term','regr_id'), ('std_term','modr_id'),
--     ('approval_queue','regr_id'), ('approval_queue','modr_id'), ('approval_queue','req_by'), ('approval_queue','decided_by'),
--     ('std_audit_log','chgr_id'), ('std_audit_log','regr_id'), ('std_audit_log','modr_id')) v(t, c)
--   LOOP
--     EXECUTE format('UPDATE %I SET %I = ''ADMIN'' WHERE %I ~* %L', r.t, r.c, r.c, re);
--   END LOOP;
--   UPDATE std_audit_log SET
--     old_val = CASE WHEN old_val IS NULL THEN NULL ELSE
--       jsonb_set(jsonb_set(old_val, '{regr_id}', CASE WHEN old_val->>'regr_id' ~* re THEN '"ADMIN"' ELSE coalesce(old_val->'regr_id', 'null') END, false),
--                 '{modr_id}', CASE WHEN old_val->>'modr_id' ~* re THEN '"ADMIN"' ELSE coalesce(old_val->'modr_id', 'null') END, false) END,
--     new_val = CASE WHEN new_val IS NULL THEN NULL ELSE
--       jsonb_set(jsonb_set(new_val, '{regr_id}', CASE WHEN new_val->>'regr_id' ~* re THEN '"ADMIN"' ELSE coalesce(new_val->'regr_id', 'null') END, false),
--                 '{modr_id}', CASE WHEN new_val->>'modr_id' ~* re THEN '"ADMIN"' ELSE coalesce(new_val->'modr_id', 'null') END, false) END
--   WHERE (old_val->>'regr_id') ~* re OR (old_val->>'modr_id') ~* re OR (new_val->>'regr_id') ~* re OR (new_val->>'modr_id') ~* re;
-- END;
-- $$;
-- -- 확인 : 아래 결과 0이어야 COMMIT, 아니면 ROLLBACK
-- SELECT count(*) AS left_cnt FROM std_audit_log
--  WHERE chgr_id ~* '^[0-9a-f]{8}-' OR (old_val->>'regr_id') ~* '^[0-9a-f]{8}-' OR (new_val->>'modr_id') ~* '^[0-9a-f]{8}-';
-- COMMIT;
--
-- R-opt. M3-opt 롤백 — 원천(동결 상태, 원값 보존)에서 되읽어 복원
--   · C4(METAPI 쓰기 개방) 이전 : M2 load() 재실행 → M3 재실행. 업서트가 작성자 컬럼·JSONB 를 원값으로 되돌린다.
--     M4 를 적용했으면 approval_queue 는 4번째 인자(apv_id::uuid)로 재적재한다(2026-10-14 리허설 실측 : 생략 시 binary 타입 불일치로 중단).
--   · C4 이후 : 신규 행·수정 행을 덮지 않도록 "원천에 있는 PK 이면서 현재 값이 'ADMIN'" 인 행만 복원한다.
--     load() 와 같은 파일 경유로 원천의 (PK, 작성자 컬럼, JSONB) 를 tmp_load 에 받은 뒤 테이블별로 :
--     UPDATE std_dic t SET regr_id = s.regr_id, modr_id = s.modr_id
--       FROM tmp_load s WHERE t.dic_id = s.dic_id AND t.mod_dtm <= :'cutover_dtm';
--     (std_dom·std_term·approval_queue 동일, std_audit_log 는 log_id 기준으로 chgr_id·regr_id·modr_id·old_val·new_val 복원)


-- ============================================================================
-- M4. [대상] apv_id TEXT → UUID 전환 (선택지 ② — 권고). 비UUID 1건이라도 있으면 EXCEPTION 으로 전체 중단.
--     tier 간 타입 분기를 막기 위해 "조용히 건너뛰기"는 하지 않는다. 선택지 ①(유지) 채택 시 이 블록 전체를 뺀다.
--     V2 체크섬 대사를 끝낸 뒤 실행한다(apv_id 텍스트 표현이 대사 기준).
--     ⛔ 02_modeler_ddl.sql 은 M4 뒤에만 적용한다 — 02 의 metric_impv_rcmnd.apv_id(UUID) FK 가 먼저 걸리면
--        이 ALTER TYPE 이 42804 로 실패한다(품질 P1, PGlite 재현). M4 미통과 시 02 의 그 컬럼만 TEXT 로 바꿔 적용.
-- ============================================================================
DO $$
DECLARE
  v_bad  BIGINT;
  v_type TEXT;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO v_type
  FROM pg_attribute
  WHERE attrelid = 'approval_queue'::regclass AND attname = 'apv_id';

  IF v_type = 'uuid' THEN
    RAISE NOTICE 'M4: apv_id 이미 uuid — 건너뜀';
    RETURN;
  END IF;

  SELECT count(*) INTO v_bad
  FROM approval_queue
  WHERE apv_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'M4 중단: 비UUID apv_id % 건 — 원인 분석 후 리더 상신(임의 보정 금지)', v_bad;
  END IF;

  ALTER TABLE approval_queue ALTER COLUMN apv_id DROP DEFAULT;
  ALTER TABLE approval_queue ALTER COLUMN apv_id TYPE UUID USING apv_id::UUID;
  ALTER TABLE approval_queue ALTER COLUMN apv_id SET DEFAULT gen_random_uuid();
END;
$$;


-- ============================================================================
-- V. [원천]·[대상] 검증 — 같은 SQL 을 양쪽에서 실행해 결과를 대조한다("대략 맞음" 없음, 1건 차이도 차단)
--    실행 전 양쪽 세션 : SET TimeZone = 'UTC';  [대상] 은 SET search_path TO <TGT_SCHEMA>; 추가
--    [원천] 은 search_path 기본값(public)으로 동작한다.
-- ============================================================================

-- V1. 건수 · 논리삭제 · 승인상태 분포 (std_audit_log 는 c1~c3 = INSERT·UPDATE·DELETE)
SELECT 'std_dic' AS tbl_nm, count(*) AS tot_cnt, count(*) FILTER (WHERE del_yn = 'Y') AS del_cnt
     , count(*) FILTER (WHERE apv_status = 'PENDING')  AS c1
     , count(*) FILTER (WHERE apv_status = 'APPROVED') AS c2
     , count(*) FILTER (WHERE apv_status = 'REJECTED') AS c3
FROM std_dic
UNION ALL SELECT 'std_dom', count(*), count(*) FILTER (WHERE del_yn = 'Y')
     , count(*) FILTER (WHERE apv_status = 'PENDING'), count(*) FILTER (WHERE apv_status = 'APPROVED')
     , count(*) FILTER (WHERE apv_status = 'REJECTED') FROM std_dom
UNION ALL SELECT 'std_term', count(*), count(*) FILTER (WHERE del_yn = 'Y')
     , count(*) FILTER (WHERE apv_status = 'PENDING'), count(*) FILTER (WHERE apv_status = 'APPROVED')
     , count(*) FILTER (WHERE apv_status = 'REJECTED') FROM std_term
UNION ALL SELECT 'approval_queue', count(*), NULL
     , count(*) FILTER (WHERE apv_status = 'PENDING'), count(*) FILTER (WHERE apv_status = 'APPROVED')
     , count(*) FILTER (WHERE apv_status = 'REJECTED') FROM approval_queue
UNION ALL SELECT 'std_audit_log', count(*), NULL
     , count(*) FILTER (WHERE action_cd = 'INSERT'), count(*) FILTER (WHERE action_cd = 'UPDATE')
     , count(*) FILTER (WHERE action_cd = 'DELETE') FROM std_audit_log;

-- V2. 체크섬 — 승계 컬럼만(소급 컬럼 제외), PK 정렬. M4 전에 실행한다
SELECT 'std_dic' AS tbl_nm
     , md5(string_agg(ROW(dic_id, dic_log_nm, dic_phy_nm, dic_phy_fll_nm, dic_desc, dic_gbn_cd, ent_clss_yn, attr_clss_yn, dom_use_yn, dom_id, data_type, data_len, data_scale, stored_term_comp_ids, apv_status, synced_at, del_yn, regr_id, reg_dtm, modr_id, mod_dtm)::text, E'
' ORDER BY dic_id::text)) AS chk_sum
FROM std_dic
UNION ALL SELECT 'std_dom'
     , md5(string_agg(ROW(dom_id, key_dom_nm, key_dom_phy_nm, dom_nm, dom_type_cd, data_type_cd, data_len, data_scale, dom_desc, apv_status, synced_at, del_yn, regr_id, reg_dtm, modr_id, mod_dtm)::text, E'
' ORDER BY dom_id::text))
FROM std_dom
UNION ALL SELECT 'std_term'
     , md5(string_agg(ROW(term_id, term_log_nm, term_phy_nm, term_phy_fll_nm, term_desc, apv_status, synced_at, del_yn, regr_id, reg_dtm, modr_id, mod_dtm)::text, E'
' ORDER BY term_id::text))
FROM std_term
UNION ALL SELECT 'approval_queue'
     , md5(string_agg(ROW(apv_id, entity_type, entity_id, entity_nm, apv_status, req_data, req_by, req_at, decided_by, decided_at, reject_reason, regr_id, reg_dtm, modr_id, mod_dtm)::text, E'
' ORDER BY apv_id::text))
FROM approval_queue
UNION ALL SELECT 'std_audit_log'
     , md5(string_agg(ROW(log_id, tgt_tbl, tgt_id, action_cd, old_val, new_val, chgr_id, chg_dtm)::text, E'
' ORDER BY log_id::text))
FROM std_audit_log;

-- V3. 고아 행 — 다형 참조라 FK 가 없다. 결과는 "보고"만 하고 보정하지 않는다(과거 물리삭제 이력이 있으면 정상 고아)
SELECT 'approval_queue' AS src_tbl, q.entity_type AS ref_type, count(*) AS orph_cnt
FROM approval_queue q
WHERE (q.entity_type = 'STD_DIC'  AND NOT EXISTS (SELECT 1 FROM std_dic  d WHERE d.dic_id::text  = q.entity_id))
   OR (q.entity_type = 'STD_DOM'  AND NOT EXISTS (SELECT 1 FROM std_dom  d WHERE d.dom_id::text  = q.entity_id))
   OR (q.entity_type = 'STD_TERM' AND NOT EXISTS (SELECT 1 FROM std_term d WHERE d.term_id::text = q.entity_id))
   OR q.entity_type NOT IN ('STD_DIC','STD_DOM','STD_TERM')
GROUP BY q.entity_type
UNION ALL
SELECT 'std_audit_log', a.tgt_tbl, count(*)
FROM std_audit_log a
WHERE (a.tgt_tbl = 'std_dic'  AND NOT EXISTS (SELECT 1 FROM std_dic  d WHERE d.dic_id::text  = a.tgt_id))
   OR (a.tgt_tbl = 'std_dom'  AND NOT EXISTS (SELECT 1 FROM std_dom  d WHERE d.dom_id::text  = a.tgt_id))
   OR (a.tgt_tbl = 'std_term' AND NOT EXISTS (SELECT 1 FROM std_term d WHERE d.term_id::text = a.tgt_id))
GROUP BY a.tgt_tbl;

-- V4. 활성 물리명 중복 — 표준사전 무결성(기대 0행). PK NULL 은 PK 제약으로 0 보장
SELECT 'std_dic.dic_phy_nm' AS chk_item, dic_phy_nm AS dup_val, count(*) AS dup_cnt
FROM std_dic WHERE del_yn = 'N' GROUP BY dic_phy_nm HAVING count(*) > 1
UNION ALL SELECT 'std_dom.key_dom_phy_nm', key_dom_phy_nm, count(*)
FROM std_dom WHERE del_yn = 'N' GROUP BY key_dom_phy_nm HAVING count(*) > 1
UNION ALL SELECT 'std_term.term_phy_nm', term_phy_nm, count(*)
FROM std_term WHERE del_yn = 'N' GROUP BY term_phy_nm HAVING count(*) > 1;

-- V5. 기간 경계 샘플 — 최소·최대 일시가 양쪽에서 같아야 한다
SELECT 'std_dic' AS tbl_nm, min(reg_dtm) AS min_dtm, max(mod_dtm) AS max_dtm FROM std_dic
UNION ALL SELECT 'std_dom', min(reg_dtm), max(mod_dtm) FROM std_dom
UNION ALL SELECT 'std_term', min(reg_dtm), max(mod_dtm) FROM std_term
UNION ALL SELECT 'approval_queue', min(reg_dtm), max(mod_dtm) FROM approval_queue
UNION ALL SELECT 'std_audit_log', min(chg_dtm), max(chg_dtm) FROM std_audit_log;

-- V6. [대상 전용] 트리거 동작 스모크 — 개발(schema_dev)에서만. 운영 실행 금지(감사 로그 오염). ROLLBACK 으로 흔적 0
-- BEGIN;
--   UPDATE std_dic SET dic_desc = dic_desc WHERE dic_id = (SELECT dic_id FROM std_dic LIMIT 1);
--   SELECT tgt_tbl, action_cd, chgr_id, regr_id FROM std_audit_log ORDER BY chg_dtm DESC LIMIT 1;  -- 'std_dic','UPDATE' 1건
-- ROLLBACK;

-- V7. [대상 전용] 소급 백필 확인 — 기대값 0
SELECT count(*) AS miss_cnt FROM std_audit_log
WHERE regr_id IS DISTINCT FROM chgr_id OR reg_dtm IS DISTINCT FROM chg_dtm;


-- ============================================================================
-- C. [원천] cafe.pi 동결 — 확정 시 cafe.pi sql/NNN_std_freeze.sql(새 순번)로 이동. 컷오버 C1 단계에서 마스터 적용.
--    API 경로 차단(410)과 별개로 DB 계층에서도 막는다 — SQL 파일·MCP 직접 실행 같은 우회 쓰기까지 차단.
--    원천 데이터는 건드리지 않는다(삭제·변경 0). 해제는 R1.
-- ============================================================================
-- C1. 쓰기 동결 (행 단위 INSERT·UPDATE·DELETE)
CREATE OR REPLACE FUNCTION public.fn_std_frozen_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '표준사전은 METAPI(schema.pi)로 이관되어 읽기 전용입니다 — % %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'read_only_sql_transaction';
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['std_dic','std_dom','std_term','approval_queue','std_audit_log'] LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER trg_%s_frozen BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public.fn_std_frozen_guard()', t, t);
  END LOOP;
END;
$$;

-- C2. 로그 정리(sql/104 fn_log_catalog)에서 std_audit_log 를 PURGEABLE → READONLY 로 바꾸는 후속 SQL 이 필요하다.
--     fn_log_catalog 는 VALUES 목록을 반환하는 함수라 함수 재정의가 필요 → 해당 순번 파일에서 원문 복제 후 1행만 수정.
--     (동결 트리거가 있으면 purge 는 오류로 끝나 데이터는 안전하지만 관리자 "로그 관리" 화면에 오류가 남는다)


-- ============================================================================
-- R. 롤백
-- ============================================================================
-- R1. [원천] 동결 해제 — C3(METAPI 쓰기 개방) 이전이면 이것만으로 원복 완료(데이터 손실 0)
-- DO $$
-- DECLARE t TEXT;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY['std_dic','std_dom','std_term','approval_queue','std_audit_log'] LOOP
--     EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_frozen ON public.%I', t, t);
--   END LOOP;
-- END;
-- $$;

-- R2. [대상] C3 이후 롤백 — 컷오버 시각(:cutover_dtm, UTC) 이후 METAPI 에서 생긴 변경분을 추출해 원천에 역반영.
--     역반영은 R1 해제 후 M2 load() 를 원천·대상을 뒤바꿔(SRC=METAPI, TGT=cafe.pi public) 같은 업서트로 수행.
--     SELECT 조건만 아래 변경분으로 좁힌다. 소급 컬럼(del_dtm·감사로그 시스템 컬럼)은 원천에 없으므로 컬럼 목록에서 뺀다.
-- SELECT count(*) FROM std_dic        WHERE reg_dtm > :'cutover_dtm' OR mod_dtm > :'cutover_dtm';
-- SELECT count(*) FROM std_dom        WHERE reg_dtm > :'cutover_dtm' OR mod_dtm > :'cutover_dtm';
-- SELECT count(*) FROM std_term       WHERE reg_dtm > :'cutover_dtm' OR mod_dtm > :'cutover_dtm';
-- SELECT count(*) FROM approval_queue WHERE reg_dtm > :'cutover_dtm' OR mod_dtm > :'cutover_dtm';
-- SELECT count(*) FROM std_audit_log  WHERE chg_dtm > :'cutover_dtm';
-- ※ M4 를 적용했다면 원천행 SELECT 에서 apv_id::text 로 내려 원천 TEXT 컬럼에 맞춘다.

-- R3. [대상] C3 이전 리허설 실패 — 대상은 정본이 아니므로 원인 수정 후 M2 업서트 재실행으로 복구(원천 무영향).
--     대상 스키마 자체를 다시 만들 필요가 있으면(타입 오류 등) dev·stg 스키마 재생성은 마스터 판단 — 이 파일 범위 밖.
