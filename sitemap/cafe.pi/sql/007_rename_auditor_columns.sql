-- 등록자/수정자 컬럼명 표준화: reg_usr_id → regr_id, mod_usr_id → modr_id
-- 복합어(REGR=등록자, MODR=수정자) 기반 한국 DA 표준 적용

-- brd_post
ALTER TABLE public.brd_post RENAME COLUMN reg_usr_id TO regr_id;
ALTER TABLE public.brd_post RENAME COLUMN mod_usr_id TO modr_id;

-- brd_cmnt
ALTER TABLE public.brd_cmnt RENAME COLUMN reg_usr_id TO regr_id;
ALTER TABLE public.brd_cmnt RENAME COLUMN mod_usr_id TO modr_id;

-- brd_attch
ALTER TABLE public.brd_attch RENAME COLUMN reg_usr_id TO regr_id;
ALTER TABLE public.brd_attch RENAME COLUMN mod_usr_id TO modr_id;

-- std_dic (006에서 추가됨)
ALTER TABLE public.std_dic RENAME COLUMN reg_usr_id TO regr_id;
ALTER TABLE public.std_dic RENAME COLUMN mod_usr_id TO modr_id;

-- std_dom (006에서 추가됨)
ALTER TABLE public.std_dom RENAME COLUMN reg_usr_id TO regr_id;
ALTER TABLE public.std_dom RENAME COLUMN mod_usr_id TO modr_id;

-- std_term (006에서 추가됨)
ALTER TABLE public.std_term RENAME COLUMN reg_usr_id TO regr_id;
ALTER TABLE public.std_term RENAME COLUMN mod_usr_id TO modr_id;
