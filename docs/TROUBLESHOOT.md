# Troubleshoot — 운영 이슈 기록

> 배포·인프라·서비스 제약으로 인해 발생한 이슈와 해결책을 기록합니다.
> 코드 버그가 아닌 **플랫폼 제약·정책·환경 차이**로 인한 이슈를 여기에 기록합니다.

---

## [2026-06-15] Vercel Hobby 플랜 — Cron Job 주기 제약

### 증상

`vercel.json`의 cron 표현식을 `*/5 * * * *`(5분마다)로 설정 후 배포 시 아래 오류 발생:

```
Hobby accounts are limited to daily cron jobs.
This cron expression (*/5 * * * *) would run more than once per day.
Upgrade to the Pro plan to unlock all Cron Jobs features on Vercel.
```

배포 자체가 차단되며 Vercel 대시보드에 FAILED 로그도 남지 않아 조용히 누락됨.

### 원인

Vercel Hobby 플랜은 **하루 1회 이하** 실행되는 cron만 허용.

| 표현식 | 실행 빈도 | Hobby 허용 |
|---|---|---|
| `0 0 * * *` | 매일 자정 1회 | ✅ |
| `0 8 * * *` | 매일 오전 8시 1회 | ✅ |
| `0 * * * *` | 매시간 (하루 24회) | ❌ |
| `*/30 * * * *` | 30분마다 (하루 48회) | ❌ |
| `*/10 * * * *` | 10분마다 (하루 144회) | ❌ |
| `*/5 * * * *` | 5분마다 (하루 288회) | ❌ |

### 해결책

**현재 적용**: `0 0 * * *` (매일 KST 09:00 = UTC 00:00) — Hobby 플랜 유지.

**Pro 업그레이드 시**: $20/월로 임의 주기 cron 사용 가능. `*/5 * * * *` 등 고빈도 재평가 가능.

### 영향 범위

- `vercel.json` → `/api/cron/event-reeval` 경로의 이벤트 미션 재평가
- 미션 재평가가 하루 1회로 제한됨 — 실시간 `recordUserAction()` 트리거는 정상 동작

### 재발 방지

- `vercel.json`의 cron 표현식 변경 시 **반드시 Hobby 제약 확인 후 커밋**
- Pro 업그레이드 전까지는 `0 H * * *` (하루 1회) 형식만 사용

---

## [2026-06-15] Vercel GitHub Integration Webhook 누락

### 증상

GitHub `master` 브랜치에 push 완료(`git push origin master`)했으나 Vercel에 자동 배포가 트리거되지 않음.
Vercel 배포 목록에 새 배포 항목 자체가 나타나지 않음 (FAILED 로그도 없음).

### 원인 (추정)

위의 Hobby cron 제약으로 인한 배포 실패가 반복되면서 Vercel GitHub App webhook이 비활성화된 것으로 추정.
또는 GitHub App 토큰 만료, Repository 권한 변경 등으로 webhook 단절 가능.

### 해결책

Vercel CLI로 수동 배포:
```bash
vercel deploy --prod --yes
```

또는 Vercel 대시보드 → `loginpi` 프로젝트 → 최신 배포 → **Redeploy** 클릭.

### 근본 해결

Vercel 대시보드 → Settings → Git → **Disconnect and reconnect** 으로 GitHub Integration 재연결.
