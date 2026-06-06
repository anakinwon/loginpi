-- TASK-035: 승인 워크플로우 보완

-- approval_queue.apv_id: UUID default 추가 (기존 no default)
ALTER TABLE public.approval_queue
  ALTER COLUMN apv_id SET DEFAULT gen_random_uuid()::TEXT;

-- approval_queue.apv_status: CHECK 제약조건 추가
ALTER TABLE public.approval_queue
  ADD CONSTRAINT approval_queue_apv_status_check
  CHECK (apv_status IN ('PENDING', 'APPROVED', 'REJECTED'));

-- std_dom에 apv_status 추가 (std_dic, std_term은 이미 존재)
ALTER TABLE public.std_dom
  ADD COLUMN IF NOT EXISTS apv_status TEXT NOT NULL DEFAULT 'APPROVED'
    CHECK (apv_status IN ('PENDING', 'APPROVED', 'REJECTED'));

-- approval_queue 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_approval_queue_status
  ON public.approval_queue (apv_status, reg_dtm DESC);

CREATE INDEX IF NOT EXISTS idx_approval_queue_entity
  ON public.approval_queue (entity_type, entity_id);
