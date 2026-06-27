# 📢 공지 — 2단계 배포 전환 (staging → 운영)

> 대상: 모든 개발 세션 + 마스터 · 발효: 즉시(Phase 1) · 상세: `docs/DEPLOY_STRATEGY.md`

## 무엇이 바뀌나

지금까지 `cafepi.vercel.app`(운영)과 `loginpi.vercel.app`(staging)이 **같은 환경**이었습니다.
→ `master`에 push하면 **검증 안 된 코드가 운영에 즉시** 나갔습니다(로그인·결제 위험).

이제 **2단계**로 분리합니다:

```
feature/* ─PR─▶  master  ─(loginpi에서 검증)─▶  production
                 🧪 staging                      운영(cafepi)
                 자동배포                          승격으로만 배포
```

## 새 규칙 (꼭 지킬 것)

| 하던 일 | 이제부터 |
|---|---|
| `master`에 push → 운영 반영 | `master` push → **staging(loginpi)만** 자동배포. 평소대로 자유롭게 push. |
| 운영 배포 | **검증 후 `master`→`production` 승격으로만**. cafepi가 production을 배포. |
| — | ⛔ `production`에 **직접 WIP push 금지**. 승격은 검증된 master만. |

### 운영에 내보내는 법 (마스터)
```bash
node scripts/promote-to-prod.mjs        # 미리보기: 무엇이 운영에 나갈지
node scripts/promote-to-prod.mjs --yes  # 실제 승격(master→production)
```
- 작업트리 안 건드림 · **fast-forward만 허용**(검증 안 된/갈라진 코드 차단).

## 지금 해야 할 일 (마스터, Vercel 대시보드)

> **확정 토폴로지: 1개 프로젝트 + 도메인 별칭 2개**(cafepi에도 🧪 배너 = 같은 프로젝트). → **프로젝트 분리 필요.** 방향: **새 프로젝트=운영, 기존=staging 유지.**

**순서 엄수(cafepi 무중단):**

1. **새 운영 프로젝트 생성** — Add New → Project → 같은 repo(loginpi) Import → 이름 예 `pycafe-prod`.
2. **새 프로젝트 설정**:
   - Settings → Git → **Production Branch = `production`**.
   - Env(Production): 기존 프로젝트 env 복사하되 — **`APP_TIER` 제외**(prod 자동) · **`CRON_SECRET` 제외**(cron 휴면) · `NEXT_PUBLIC_PI_SANDBOX=true` · SUPABASE는 개발DB(그림자). 나머지(GOOGLE/TELEGRAM/GEMINI/TURN/AUTH_SECRET/PI_SESSION_SECRET) 복사.
3. **production 브랜치 그린 빌드 확인** — 새 프로젝트 Deployments에서 production 빌드 성공 확인.
4. **도메인 이전(그린 확인 후에만)**: 기존 프로젝트 Domains에서 `cafepi.vercel.app` **Remove** → 새 프로젝트 Domains에 **Add**.
5. **기존 프로젝트는 staging 그대로** — Production Branch=`master` + `APP_TIER=staging` 유지. `loginpi.vercel.app`만 남김.

**검증**:
- `cafepi.vercel.app` → 🧪 배너 **없음**(운영 tier) · `loginpi.vercel.app` → 🧪 배너 **있음**.
- `master`에 빈 커밋 push → **loginpi만** 재배포·cafepi 불변.
- `node scripts/promote-to-prod.mjs --yes` → cafepi 재배포.

## 아직 안 바뀌는 것

- **DB·Pi 네트워크 분리는 Phase 3(컷오버)** — 운영DB 신설·메인넷 전환 완료 후. 그 전까지 cafepi는 "운영 게이팅된 그림자"(개발DB·sandbox)로, **메인넷 아님 → 외부 공지 금지**.
- 멀티세션 "전부 master push" 파일럿은 **그대로 유효**(staging까지). 운영만 의도적 승격으로 분리됐을 뿐.

## 상태 요약

| | Phase 1(지금) | Phase 3(컷오버) |
|---|---|---|
| 파이프라인 분리(브랜치 게이팅) | ✅ | — |
| tier 마커(🧪 배너) | ✅ staging | — |
| DB·Pi 네트워크 분리 | ⏳ 개발DB·sandbox | 운영DB·메인넷 |
