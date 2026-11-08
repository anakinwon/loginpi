-- P1 #4: std_* 테이블 접미사 불일치 수정
-- std_dic_sync → std_dic, std_dom_sync → std_dom

BEGIN;

-- ===== 1. std_dic_sync → std_dic =====
ALTER TABLE public.std_dic_sync RENAME CONSTRAINT std_dic_sync_pkey TO std_dic_pkey;
ALTER TABLE public.std_dic_sync RENAME TO std_dic;

-- ===== 2. std_dom_sync → std_dom =====
ALTER TABLE public.std_dom_sync RENAME CONSTRAINT std_dom_sync_pkey TO std_dom_pkey;
ALTER TABLE public.std_dom_sync RENAME TO std_dom;

COMMIT;
