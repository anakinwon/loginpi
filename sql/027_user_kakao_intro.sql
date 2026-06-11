-- sys_user: 카카오톡 ID + 자기소개 컬럼 추가
-- DA-APPROVED: kakao_id(_id 식별자 도메인), self_intro(TEXT 자유텍스트)

ALTER TABLE public.sys_user
  ADD COLUMN IF NOT EXISTS kakao_id   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS self_intro TEXT;

COMMENT ON COLUMN public.sys_user.kakao_id   IS '카카오톡 ID (소셜 연동 식별자)';
COMMENT ON COLUMN public.sys_user.self_intro IS '자기소개';
