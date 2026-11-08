-- Phase 2.2: Pi + Google 계정 통합용 users 테이블
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS users (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pi Network 계정
  pi_uid             TEXT        UNIQUE,
  pi_username        TEXT,
  pi_wallet_address  TEXT,

  -- Google 계정
  google_id          TEXT        UNIQUE,
  google_email       TEXT,
  google_name        TEXT,
  google_image       TEXT,

  -- 공통 프로필
  display_name       TEXT        NOT NULL DEFAULT '',
  role               TEXT        NOT NULL DEFAULT 'USER'
                                 CHECK (role IN ('ADMIN','MASTER','MANAGER','USER')),

  -- 시스템 컬럼
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION fn_update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_update_users_updated_at();

-- RLS 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- service_role(앱 서버)은 전체 허용
CREATE POLICY "service_role_all" ON users
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 인증 사용자는 SELECT 허용 (본인 확인 용도)
CREATE POLICY "authenticated_read" ON users
  FOR SELECT TO authenticated
  USING (true);
