-- 011_seminar_isl.sql — 섬 이름 마스터(세계 유명 관광 섬 방문객 순위 Top 100) + 세미나 개설 함수(섬 이름 = 세미나 이름, 마스터 2026-10-28)
-- DA-APPROVED: 아소카 결정(마스터 위임 2026-10-28) — 테이블 1개(smn_isl_mst)·smn_mst 칼럼 2개(isl_no·isl_sfx_no)·유일 인덱스 1개·함수 1개(fn_crt_smn). DA 사후 리뷰 대상
-- 선행 : 004(smn_mst). 적용 : node scripts/db-migrate.mjs --app seminar --tier dev|stg|prod
--
-- 신규 표준단어(아소카 결정, DA 사후 리뷰 시 §9 등재) :
--  · 섬 ISL (Island) — smn_isl_mst · isl_no · isl_nm   · 접미 SFX (Suffix) — isl_sfx_no
--  · 방문객 VSTR (Visitor) — ann_vstr_cnt(연간 방문객 수)   · 국가명 cntry_nm 은 i18n_cntry_mst 관용 승계
--
-- 규칙(마스터 결정) :
--  · 세미나를 열면 이름을 이 표의 섬 이름에서 무작위로 정한다(제목 입력 없음). 화면 표시 = smn_mst.smn_nm(한글 섬 이름)
--  · 진행·예정(SCHEDULED·LIVE) 세미나끼리 섬이 겹치지 않는다 — 끝나거나 취소·삭제되면 그 섬은 다시 쓸 수 있다
--  · 지금은 접미 없이(isl_sfx_no = 0) 최대 100개. 남은 섬이 없으면 fn_crt_smn 이 행 0건 → API 409 ISLAND_FULL
--  · 추후 확장 : isl_sfx_no 1부터 '섬이름_0001' 형식(이 칼럼·유일 인덱스가 (isl_no, isl_sfx_no) 라 함수만 바꾸면 된다)
BEGIN;

CREATE TABLE IF NOT EXISTS smn_isl_mst (
  isl_no        INT           NOT NULL,                                   -- 섬번호(방문객 순위 1~100)
  cntry_nm      VARCHAR(100)  NOT NULL,                                   -- 국가·지역명(한글)
  cntry_nm_en   VARCHAR(100)  NOT NULL,                                   -- 국가·지역명(영문)
  isl_nm        VARCHAR(100)  NOT NULL,                                   -- 섬이름(한글) — 세미나 이름
  isl_nm_en     VARCHAR(100)  NOT NULL,                                   -- 섬이름(영문)
  ann_vstr_cnt  BIGINT,                                                   -- 연간 방문객 수(약)
  use_yn        CHAR(1)       NOT NULL DEFAULT 'Y',                       -- 사용여부(N = 배정 제외)
  del_yn        CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm       TIMESTAMPTZ,                                              -- 삭제일시
  regr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 등록자ID
  reg_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 등록일시
  modr_id       TEXT          NOT NULL DEFAULT 'ADMIN',                   -- 변경자ID
  mod_dtm       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,         -- 변경일시
  CONSTRAINT pk_smn_isl_mst PRIMARY KEY (isl_no),
  CONSTRAINT smn_isl_mst_use_yn_check CHECK (use_yn IN ('Y', 'N')),
  CONSTRAINT smn_isl_mst_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE smn_isl_mst IS '섬 이름 마스터 — 세계 유명 관광 섬 방문객 순위 Top 100. 세미나 이름(무작위 배정) 원천';
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_isl_mst_01 ON smn_isl_mst (isl_nm) WHERE del_yn = 'N';
COMMENT ON INDEX x_smn_isl_mst_01 IS '섬이름(한글) 중복 금지 — 세미나 이름이 겹치지 않게';

INSERT INTO smn_isl_mst (isl_no, cntry_nm, cntry_nm_en, isl_nm, isl_nm_en, ann_vstr_cnt) VALUES
  (1, '중국', 'China', '하이난', 'Hainan', 90000000),
  (2, '인도네시아', 'Indonesia', '발리', 'Bali', 16000000),
  (3, '싱가포르', 'Singapore', '센토사', 'Sentosa', 15000000),
  (4, '대한민국', 'South Korea', '제주도', 'Jeju Island', 13500000),
  (5, '스페인', 'Spain', '마요르카', 'Mallorca', 13000000),
  (6, '태국', 'Thailand', '푸껫', 'Phuket', 12000000),
  (7, '카리브해', 'Caribbean', '히스파니올라', 'Hispaniola', 11000000),
  (8, '중국', 'China', '구랑위', 'Gulangyu', 9000000),
  (9, '일본', 'Japan', '오키나와 본섬', 'Okinawa Main Island', 9000000),
  (10, '말레이시아', 'Malaysia', '페낭', 'Penang', 7000000),
  (11, '스페인(카나리아)', 'Spain (Canary Islands)', '테네리페', 'Tenerife', 7000000),
  (12, '미국(하와이)', 'USA (Hawaii)', '와이키키', 'Waikiki', 6000000),
  (13, '베트남', 'Vietnam', '푸꾸옥', 'Phu Quoc', 6000000),
  (14, '이탈리아', 'Italy', '시칠리아', 'Sicily', 5500000),
  (15, '그리스', 'Greece', '크레타', 'Crete', 5500000),
  (16, '미국령', 'U.S. Territory', '푸에르토리코', 'Puerto Rico', 5000000),
  (17, '바하마', 'The Bahamas', '뉴프로비던스', 'New Providence', 5000000),
  (18, '스페인(카나리아)', 'Spain (Canary Islands)', '그란카나리아', 'Gran Canaria', 4500000),
  (19, '멕시코', 'Mexico', '코수멜', 'Cozumel', 4500000),
  (20, '일본', 'Japan', '미야지마', 'Miyajima', 4500000),
  (21, '자메이카', 'Jamaica', '자메이카', 'Jamaica', 4300000),
  (22, '이탈리아', 'Italy', '사르데냐', 'Sardinia', 4000000),
  (23, '키프로스', 'Cyprus', '키프로스', 'Cyprus', 4000000),
  (24, '몰타', 'Malta', '몰타', 'Malta', 3500000),
  (25, '스페인', 'Spain', '이비사', 'Ibiza', 3400000),
  (26, '스페인(카나리아)', 'Spain (Canary Islands)', '란사로테', 'Lanzarote', 3200000),
  (27, '대한민국', 'South Korea', '남이섬', 'Nami Island', 3000000),
  (28, '프랑스', 'France', '코르시카', 'Corsica', 3000000),
  (29, '필리핀', 'Philippines', '세부', 'Cebu', 3000000),
  (30, '말레이시아', 'Malaysia', '랑카위', 'Langkawi', 3000000),
  (31, '미국', 'USA', '키웨스트', 'Key West', 3000000),
  (32, '미국(하와이)', 'USA (Hawaii)', '마우이', 'Maui', 2800000),
  (33, '프랑스', 'France', '몽생미셸', 'Mont-Saint-Michel', 2800000),
  (34, '태국', 'Thailand', '코사무이', 'Koh Samui', 2700000),
  (35, '그리스', 'Greece', '산토리니', 'Santorini', 2500000),
  (36, '그리스', 'Greece', '로도스', 'Rhodes', 2500000),
  (37, '이탈리아', 'Italy', '카프리', 'Capri', 2500000),
  (38, '영국', 'United Kingdom', '와이트섬', 'Isle of Wight', 2300000),
  (39, '스페인(카나리아)', 'Spain (Canary Islands)', '푸에르테벤투라', 'Fuerteventura', 2300000),
  (40, '쿠바', 'Cuba', '쿠바', 'Cuba', 2200000),
  (41, '아이슬란드', 'Iceland', '아이슬란드', 'Iceland', 2200000),
  (42, '네덜란드령', 'Kingdom of the Netherlands', '아루바', 'Aruba', 2200000),
  (43, '몰디브', 'Maldives', '몰디브', 'Maldives', 2000000),
  (44, '스리랑카', 'Sri Lanka', '스리랑카', 'Sri Lanka', 2000000),
  (45, '필리핀', 'Philippines', '보라카이', 'Boracay', 2000000),
  (46, '포르투갈', 'Portugal', '마데이라', 'Madeira', 2000000),
  (47, '그리스', 'Greece', '코르푸', 'Corfu', 2000000),
  (48, '네덜란드·프랑스령', 'Netherlands / France', '신트마르턴', 'Sint Maarten', 2000000),
  (49, '대한민국', 'South Korea', '우도', 'Udo Island', 2000000),
  (50, '미국(하와이)', 'USA (Hawaii)', '빅아일랜드', 'Big Island (Hawaii Island)', 1800000),
  (51, '필리핀', 'Philippines', '팔라완', 'Palawan', 1800000),
  (52, '미국령 버진아일랜드', 'U.S. Virgin Islands', '세인트토머스', 'St. Thomas', 1800000),
  (53, '영국령 케이맨', 'Cayman Islands (UK)', '그랜드케이맨', 'Grand Cayman', 1700000),
  (54, '인도네시아', 'Indonesia', '롬복', 'Lombok', 1500000),
  (55, '그리스', 'Greece', '미코노스', 'Mykonos', 1500000),
  (56, '스페인', 'Spain', '메노르카', 'Menorca', 1500000),
  (57, '캐나다', 'Canada', '프린스에드워드아일랜드', 'Prince Edward Island', 1500000),
  (58, '태국', 'Thailand', '피피섬', 'Koh Phi Phi', 1500000),
  (59, '필리핀', 'Philippines', '보홀', 'Bohol', 1500000),
  (60, '미국(하와이)', 'USA (Hawaii)', '카우아이', 'Kauai', 1400000),
  (61, '모리셔스', 'Mauritius', '모리셔스', 'Mauritius', 1300000),
  (62, '일본', 'Japan', '이시가키', 'Ishigaki', 1300000),
  (63, '바베이도스', 'Barbados', '바베이도스', 'Barbados', 1300000),
  (64, '네덜란드령', 'Kingdom of the Netherlands', '퀴라소', 'Curaçao', 1300000),
  (65, '호주', 'Australia', '태즈메이니아', 'Tasmania', 1300000),
  (66, '온두라스', 'Honduras', '로아탄', 'Roatán', 1300000),
  (67, '그리스', 'Greece', '코스', 'Kos', 1200000),
  (68, '포르투갈', 'Portugal', '상미겔', 'São Miguel (Azores)', 1200000),
  (69, '콜롬비아', 'Colombia', '산안드레스', 'San Andrés', 1200000),
  (70, '태국', 'Thailand', '꼬사멧', 'Koh Samet', 1200000),
  (71, '세인트루시아', 'Saint Lucia', '세인트루시아', 'Saint Lucia', 1200000),
  (72, '앤티가 바부다', 'Antigua and Barbuda', '앤티가', 'Antigua', 1100000),
  (73, '대만', 'Taiwan', '펑후', 'Penghu', 1000000),
  (74, '그리스', 'Greece', '자킨토스', 'Zakynthos', 1000000),
  (75, '태국', 'Thailand', '코팡안', 'Koh Phangan', 1000000),
  (76, '독일', 'Germany', '질트', 'Sylt', 1000000),
  (77, '노르웨이', 'Norway', '로포텐 제도', 'Lofoten Islands', 1000000),
  (78, '피지', 'Fiji', '비티레부', 'Viti Levu', 900000),
  (79, '뉴질랜드', 'New Zealand', '와이헤케', 'Waiheke Island', 900000),
  (80, '영국령', 'British Overseas Territory', '버뮤다', 'Bermuda', 900000),
  (81, '이탈리아', 'Italy', '이스키아', 'Ischia', 800000),
  (82, '인도네시아', 'Indonesia', '누사페니다', 'Nusa Penida', 800000),
  (83, '미국령', 'U.S. Territory', '괌', 'Guam', 750000),
  (84, '탄자니아', 'Tanzania', '잔지바르', 'Zanzibar', 700000),
  (85, '인도네시아', 'Indonesia', '길리 제도', 'Gili Islands', 700000),
  (86, '일본', 'Japan', '나오시마', 'Naoshima', 700000),
  (87, '영국(스코틀랜드)', 'United Kingdom (Scotland)', '스카이섬', 'Isle of Skye', 650000),
  (88, '그리스', 'Greece', '케팔로니아', 'Kefalonia', 600000),
  (89, '이탈리아', 'Italy', '엘바', 'Elba', 600000),
  (90, '그리스', 'Greece', '파로스', 'Paros', 600000),
  (91, '프랑스령', 'France (Overseas)', '레위니옹', 'Réunion', 550000),
  (92, '그리스', 'Greece', '낙소스', 'Naxos', 500000),
  (93, '태국', 'Thailand', '코타오', 'Koh Tao', 500000),
  (94, '대한민국', 'South Korea', '울릉도', 'Ulleungdo', 400000),
  (95, '크로아티아', 'Croatia', '흐바르', 'Hvar', 400000),
  (96, '호주', 'Australia', '크가리', 'K''gari (Fraser Island)', 400000),
  (97, '세이셸', 'Seychelles', '세이셸', 'Seychelles', 350000),
  (98, '에콰도르', 'Ecuador', '갈라파고스', 'Galápagos Islands', 270000),
  (99, '프랑스령 폴리네시아', 'French Polynesia', '타히티', 'Tahiti', 260000),
  (100, '프랑스령 폴리네시아', 'French Polynesia', '보라보라', 'Bora Bora', 100000)
ON CONFLICT (isl_no) DO NOTHING;

ALTER TABLE smn_mst ADD COLUMN IF NOT EXISTS isl_no INT CONSTRAINT smn_mst_isl_no_fkey REFERENCES smn_isl_mst (isl_no); -- 섬번호(이름 원천, 이전 세미나는 NULL)
ALTER TABLE smn_mst ADD COLUMN IF NOT EXISTS isl_sfx_no INT NOT NULL DEFAULT 0;                                           -- 섬접미번호(0 = 접미 없음, 추후 _0001~)
COMMENT ON COLUMN smn_mst.isl_no IS '섬번호 → smn_isl_mst. 세미나 이름(smn_nm)을 정한 섬. 이 기능 이전 세미나는 NULL';
COMMENT ON COLUMN smn_mst.isl_sfx_no IS '섬접미번호 — 0 = 섬 이름 그대로, 1 이상 = 섬이름_0001 형식(추후 100개 초과 확장)';

-- 진행·예정 세미나끼리 같은 섬(＋접미) 금지 — 경합 마지막 방어(함수는 잠금으로 먼저 막는다)
CREATE UNIQUE INDEX IF NOT EXISTS x_smn_mst_03
  ON smn_mst (isl_no, isl_sfx_no) WHERE del_yn = 'N' AND smn_sts_cd IN ('SCHEDULED', 'LIVE') AND isl_no IS NOT NULL;
COMMENT ON INDEX x_smn_mst_03 IS '진행·예정 세미나 섬 이름 중복 금지';

-- 세미나 개설 — 남은 섬 하나를 무작위로 골라 그 이름으로 만든다. 동시 개설은 트랜잭션 잠금으로 줄 세워 같은 섬을 두 번 고르지 않는다(R-P5).
-- 반환 0행 = 남은 섬 없음(API 409 ISLAND_FULL)
CREATE OR REPLACE FUNCTION fn_crt_smn(p_hst_usr_id UUID, p_start_dtm TIMESTAMPTZ, p_max_cnt INT, p_ent_pi_amt NUMERIC)
RETURNS TABLE (smn_id UUID, smn_nm VARCHAR)
LANGUAGE plpgsql
AS $$
DECLARE
  v_no INT;
  v_nm VARCHAR(100);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fn_crt_smn'));
  SELECT i.isl_no, i.isl_nm INTO v_no, v_nm
    FROM smn_isl_mst i
   WHERE i.use_yn = 'Y' AND i.del_yn = 'N'
     AND NOT EXISTS (
       SELECT 1 FROM smn_mst m
        WHERE m.isl_no = i.isl_no AND m.isl_sfx_no = 0
          AND m.del_yn = 'N' AND m.smn_sts_cd IN ('SCHEDULED', 'LIVE'))
   ORDER BY random()
   LIMIT 1;
  IF v_no IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  INSERT INTO smn_mst AS s (hst_usr_id, smn_nm, start_dtm, max_cnt, ent_pi_amt, isl_no, isl_sfx_no, regr_id, modr_id)
  VALUES (p_hst_usr_id, v_nm, p_start_dtm, p_max_cnt, p_ent_pi_amt, v_no, 0, p_hst_usr_id::TEXT, p_hst_usr_id::TEXT)
  RETURNING s.smn_id, s.smn_nm;
END;
$$;

DO $$
BEGIN
  EXECUTE format('ALTER FUNCTION fn_crt_smn(UUID, TIMESTAMPTZ, INT, NUMERIC) SET search_path = %I, pg_temp', current_schema());
END;
$$;
SELECT fn_grant_svc_only('TABLE', 'smn_isl_mst');
SELECT fn_grant_svc_only('FUNCTION', 'fn_crt_smn(UUID, TIMESTAMPTZ, INT, NUMERIC)');

COMMIT;
