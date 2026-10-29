# 집 상시 PC(192.168.0.16)에 Galápagos 엔진 올리기 — 외부 접속 가이드

> 작성 2026-10-25 · 대상 : 마스터 집 네트워크의 상시 가동 PC `192.168.0.16`(Pi Node 실행 중) · 관련 결정 C-5(VM) 대안
> 목적 : 클라우드 VM 대신 집 PC로 **M1 LTE 시험을 먼저** 진행한다. M2 손실 시험은 그 PC 의 OS 확인 뒤(6절 4번). 운영 서비스는 VM 권장(8절)

## ★ 현행 방식 (2026-10-26) — 대안 1 : 신호는 터널, 영상만 UDP 포워딩

> 0~4절의 443·Caddy·DuckDNS 방식은 **인터넷에서 TCP 443 수신이 안 되어 보류**(외부 점검 3곳 모두 시간 초과, 2026-10-26 — 공유기 포워딩 미반영 또는 통신사 차단, 원인 미확정). 공유기 WAN = 공인 IP(`115.86.x.x`)와 같음을 확인(이중 NAT·CGNAT 아님, 케이블모뎀은 통과만 함).
> 이 절만 따라 하면 되고, 0~4절은 엔진 파일·`run-engine.cmd`·방화벽(4.2·4.3·4.6)만 그대로 씁니다.

```
LTE 휴대폰 ─ 신호 wss ─→ Cloudflare 임시 터널 ─(집 PC가 바깥으로 연결, 포워딩 불필요)─→ 192.168.0.16 엔진 :7880
          └─ 영상 UDP ─→ <공인 IP>:7882 ─(공유기 UDP 포워딩 1줄)─→ 192.168.0.16 :7882
```

### A. 공유기 (ipTIME, `http://192.168.0.1`)
1. 고급 설정 → NAT/라우터 관리 → **포트포워드 설정** : `UDP 7882 → 192.168.0.16 : 7882` 한 줄 (TCP 443 규칙은 지워도 됨) → 적용
2. 고급 설정 → 네트워크 관리 → 내부 네트워크 설정 → **수동 주소 등록** 에 192.168.0.16 등록(재부팅 후 IP 변경 방지)
- 메뉴 이름은 펌웨어마다 조금 다를 수 있음 [확인중 : 마스터 공유기 화면 — 2026-10-26 로그인 경로 `/sess-bin/login_session.cgi` 로 ipTIME 확인]

### B. 192.168.0.16 — 엔진
1. `run-engine.cmd`(4.2) 값 :
   - `MEDIA_PUBLIC_IP` = 공유기 관리 화면(`http://192.168.0.1`) 시스템 요약 정보의 **외부 IP 주소**(2절 ②) — 숫자 4덩어리만
   - `MEDIA_TOKEN_SECRET` = 마스터 PC `sitemap/seminar.pi/.env.vercel-prod` 의 같은 키 값(Vercel 과 같은 값, 앞뒤 공백 없이)
   - `MEDIA_ALLOWED_ORIGINS=https://seminarz.vercel.app,https://seminar0532.pinet.com` — Pi 포털 래퍼(seminar0532.pinet.com)가 실제 앱을 **https://seminarz.vercel.app** 에서 불러오므로(2026-10-27 래퍼 HTML 확인) Pi Browser 의 Origin 은 앞의 값일 가능성이 높습니다. 실측 전이라 **둘 다** 넣습니다 [확인중 : Pi Browser Origin]
   - `MEDIA_ADMIN_SECRET` = **엔진과 Vercel `seminar` 양쪽에 같은 무작위 32바이트 이상 값을 넣거나, 양쪽 다 뺍니다** (2026-10-29 정정 — 이전 "넣지 않는다" 지침 대체). 값 만들기 : 마스터 PC `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, Vercel 에 넣은 뒤 Redeploy
     - 넣으면 : 터널이 엔진의 모든 경로를 공개하므로 `/admin/` 도 인터넷에서 닿지만, 요청마다 `Authorization: Bearer <키>` 를 상수 시간 비교하고 틀리면 지연 뒤 401 입니다(`media/internal/bora/admin.go:174-183`). 그래서 **짧거나 추측 가능한 값은 금지** — 엔진은 32바이트 미만이면 관리 API 전체를 404 로 끄고(`admin.go:129`·`:176-178`, `signal.MinSecret = 32` — `media/internal/signal/ticket.go:34`), Vercel 은 32자 미만이면 env 검증에서 막힙니다(`src/env.ts:44`)
     - 빼면(양쪽 다) : 엔진 `/admin/` 404, 화면 서버는 관리 API 를 부르지 않습니다. 기본 입장·영상·자막은 동작하되 **두 가지가 꺼집니다** — ① 음성 자막 무대 관문(D-1) 생략 : `/api/speech/chunk` 가 엔진에 무대 역할을 묻지 않아(`src/lib/speech-gate.ts:113-117`) 청중 음성 조각도 DB 청중 몫(1/2) 상한까지만 막힘 ② 시간 소진 종료 때 엔진 방 강제 종료(`DELETE /admin/rooms/{id}`) 생략(`src/lib/plan.ts:86-95`) — DB 세미나만 ENDED
     - ⚠ 한쪽만 넣으면 고장 : **Vercel 에만** 넣으면 엔진 `/admin/` 404 를 화면 서버가 "무대에 없음"으로 읽어(`speech-gate.ts:127`·`:131`) ADMIN 외 발표자·패널 음성 자막이 403 `SPEECH_STAGE_ONLY` 로 거절됩니다(`speech-gate.ts:137`). **두 값이 다르면** 엔진 401 → 503 `AI_UNAVAILABLE`(`speech-gate.ts:127-129`). 엔진에만 넣으면 관문 생략(빼는 것과 같음)
     - 관리 API 주소는 `NEXT_PUBLIC_MEDIA_WS_URL` 에서 만듭니다(`speech-gate.ts:112`) — 터널 주소가 바뀌면 이 값도 바꾸고 Redeploy
2. 방화벽 UDP 7882 규칙(4.3 첫 줄) 실행
3. 엔진 켜기 / 값을 바꾼 뒤 다시 켜기 — 관리자 cmd 에서 세 줄(`/End` 만 하면 galapagos.exe 가 남아 포트를 잡고 있음) :
   ```
   schtasks /End /TN "Galapagos Engine"
   taskkill /IM galapagos.exe /F
   schtasks /Run /TN "Galapagos Engine"
   ```
   작업을 아직 등록하지 않았다면 4.4 의 Engine 줄과 72시간 설정만 먼저 실행합니다
4. Caddy·DuckDNS 작업을 등록했었다면 끕니다(등록한 적 없으면 "지정된 작업 없음" — 건너뜀) :
   ```
   schtasks /End /TN "Galapagos Caddy"
   schtasks /Change /TN "Galapagos Caddy" /DISABLE
   schtasks /Change /TN "Galapagos DuckDNS" /DISABLE
   ```
5. 확인 : 그 PC 브라우저 `http://127.0.0.1:7880/healthz` → `ok` (안 되면 4.6)

### C. 192.168.0.16 — 터널 (cloudflared)
1. 설치(한 번) : `winget install --id Cloudflare.cloudflared` (마스터 PC 에서 같은 방법으로 설치해 쓴 적 있음, 2026-10-25)
2. **새** cmd 창에서 실행 — **창을 닫으면 터널도 끊깁니다** :
   ```
   cloudflared tunnel --no-autoupdate --url http://127.0.0.1:7880
   ```
   `cloudflared` 를 찾을 수 없다고 나오면 설치 경로로 실행 : `"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://127.0.0.1:7880` (마스터 PC 기준 경로, 다르면 `where cloudflared`)
3. 화면에 나온 `https://xxxx-xxxx.trycloudflare.com` 을 적어 둡니다 → 엔진 주소 = **`wss://xxxx-xxxx.trycloudflare.com/signal`**
4. 확인 : 휴대폰 LTE(와이파이 끔)로 `https://xxxx-xxxx.trycloudflare.com/healthz` → `ok`
- 임시 터널 주소는 **다시 켤 때마다 바뀝니다**(마스터 PC 에서 관찰, 2026-10-25) — 바뀌면 시험 화면 엔진 주소 칸에만 새로 넣으면 됨(재배포 불필요). 고정 주소는 도메인 구입 후 Cloudflare 고정 터널로 [TBD : 마스터 — 도메인]

### D. Vercel (seminar 프로젝트, Production)
1. Settings → Environment Variables :
   - `MEDIA_TOKEN_SECRET` = B 와 같은 값(32자 이상)
   - `LAB_ENABLED` = 정확히 `1` (시험 화면 열기)
   - `NEXT_PUBLIC_PI_APP_DOMAIN` = `seminar0532.pinet.com` (없으면 Pi Browser 의 입장권 요청이 `403 cross_origin_auth` 로 막힘) [확인중 : Vercel 현재 값 — 마스터 PC 사본은 비어 있음]
2. Deployments → 최신 배포 … → **Redeploy**
3. 같은 화면에서 상태가 **Ready** 인지 확인. **Error** 면 위 값 형식 오류(빌드가 값을 검사함) — 이때 Vercel 은 옛 배포를 그대로 내보내므로 화면이 열려도 반영된 것이 아닙니다

### E. 시험 (휴대폰 2대 이상, 모두 와이파이 끔)
1. 발표자 휴대폰 : Pi Browser 로 `https://seminar0532.pinet.com/ko/lab/sfu` → **로그인 먼저**(발표자는 관리자 계정)
2. 엔진 주소 칸의 기존 글자를 **지우고** C-3 의 `wss://…/signal` 입력
3. 방 이름은 기본값 `lab-1` 그대로(영문·숫자·`-`·`_` 만 — 한글·공백이면 `입장권 없음(400)`)
4. '발표자' 선택 → 입장 → 카메라·마이크 권한 창이 뜨면 **허용**
5. 청중 휴대폰(들) : 같은 주소·로그인·같은 엔진 주소·같은 방 → '청중' 선택 → 입장. `탭하여 재생` 버튼이 보이면 누릅니다
6. 성공 로그 : `입장권 발급됨` → `입장 peer=… 기존 발행 N개` → 발표자 `발행 PC connected` / 청중 `구독 PC connected` · `수신 트랙 video`

| 로그 문구 | 원인 | 조치 |
|---|---|---|
| `입장권 없음(401)` | 로그인 안 됨 | 먼저 로그인 |
| `입장권 없음(403)` — 발표자만 | 발표자는 관리자(ADMIN)만 | 관리자 계정으로 발표, 또는 아소카에게 권한 확인 요청 |
| `입장권 없음(403)` — 청중도 | 앱의 Origin 검사(`cross_origin_auth`) | D-1 `NEXT_PUBLIC_PI_APP_DOMAIN` 확인 후 Redeploy |
| `입장권 없음(400)` | 방 이름 형식 | E-3 |
| `입장권 없음(503)` | `MEDIA_TOKEN_SECRET` 미설정, 또는 배포 실패로 옛 배포가 서비스 중 | D 전체 확인(Ready 여부 포함) |
| `입장 실패 TICKET_INVALID 형식 오류` | 바로 앞 `입장권 없음(…)` 의 결과 | 앞줄 원인부터 해결 |
| `입장 실패 TICKET_INVALID 서명 불일치` | Vercel 과 엔진의 비밀키가 다름 | B-1·D-1 값 다시 붙여넣기 → B-3 엔진 재시작 |
| `발급 시각이 미래` / `TICKET_EXPIRED` | 집 PC 시계가 5초 넘게 어긋남 | 그 PC : Windows 설정 → 시간 및 언어 → 날짜 및 시간 → **지금 동기화** |
| `WebSocket 연결 실패` | 터널 꺼짐·주소 오타, 또는 엔진이 Origin 거부 | C-2 창·C-4 healthz 확인 → 정상이면 `engine.log` 의 `origin 불허 : "…"` 줄의 값을 B-1 `MEDIA_ALLOWED_ORIGINS` 에 추가 → B-3 |
| `발행 PC failed` / `구독 PC failed` | 영상 UDP 가 집에 못 들어옴 | A-1 UDP 포워딩·B-2 방화벽·`MEDIA_PUBLIC_IP` 확인 |

- Origin 만 따로 확인하려면 아무 PC cmd : `curl -i -H "Origin: https://seminar0532.pinet.com" https://xxxx-xxxx.trycloudflare.com/signal` → `403 … origin 불허` = 허용 목록 불일치 / `400` = Origin 통과
- UDP 까지 막혀 `failed` 가 계속되면 → 대안 2(관리형 TURN 중계, 포워딩 없음 — 엔진이 `MEDIA_ICE_SERVERS` 를 자기 연결에도 쓰므로 설정만으로 될 것으로 봄) [확인중 : TURN 실측] [TBD : 마스터 — 서비스 선택]

## 0. 한눈에 보기

```
[외부 휴대폰(LTE)]
   │ ① 신호 wss://<이름>.duckdns.org/signal  (TCP 443)
   │ ② 영상 UDP <공인 IP>:7882
   ▼
[집 공유기]  ── 포트포워딩 : TCP 443, UDP 7882 → 192.168.0.16
   ▼
[192.168.0.16 상시 PC]
   ├─ Caddy (443, 인증서 자동 발급) ──▶ Galápagos 127.0.0.1:7880 (신호)
   ├─ Galápagos UDP 7882 (영상)
   └─ Pi Node (기존, 31400~31409) — 그대로 둠
```

- 신호(WebSocket)는 Caddy 가 TLS(wss)를 붙여 엔진에 넘깁니다. 영상(UDP)은 공유기를 거쳐 엔진으로 바로 갑니다.
- 무료 고정 이름은 DuckDNS(`<이름>.duckdns.org`)로 만듭니다. 집 공인 IP 가 바뀌어도 이름은 그대로입니다.
- 아래 예시 이름은 `seminar-galapagos` 입니다. 다른 이름을 쓰면 Caddyfile·duckdns.cmd·4.5·5절의 `seminar-galapagos` 를 모두 바꿉니다.

## 1. 이 PC에서 확인한 사실 (2026-10-25, 마스터 PC 192.168.0.18 에서 포트 점검)

| 항목 | 결과 | 의미 |
|---|---|---|
| 192.168.0.16 TCP 31401 | 열림 | Pi Node 동작 중 |
| TCP 22(SSH)·3389(원격 데스크톱)·5985·445 | 닫힘 | 열린 원격 접속 포트 없음(바깥으로 연결하는 원격 앱 여부는 미확인) → 설치는 그 PC 앞에서 |
| TCP 80·443·2375 | 닫힘 | Caddy 가 443 을 쓸 수 있음(다른 프로그램이 점유하지 않음) |
| ping | 응답 없음 | Windows 방화벽 기본값으로 보임 [확인중 : OS] |
| 이 집의 공인 IP | 115.86.x.x | 포트포워딩 가능 여부 판정은 2절 ② 에서 |

## 2. 마스터 사전 점검 (10분)

| # | 확인할 것 | 방법 | 통과 기준 |
|---|---|---|---|
| ① | 192.168.0.16 의 OS | 그 PC 화면 | Windows 면 4절, Linux 면 부록 |
| ② | 공유기 WAN IP | 공유기 관리 화면(보통 192.168.0.1) → 인터넷/WAN 정보의 IP 를 https://api.ipify.org 값과 비교 | **같으면 OK** · WAN IP 가 100.64~100.127 로 시작하면 통신사 공유 IP(CGNAT) → 포트포워딩 불가, 8절 VM · 192.168·10·172.16~31 로 시작하면 이중 공유기(통신사 모뎀 + 개인 공유기) → 상위 장비에도 포트포워딩 또는 브리지 모드 [확인중 : 통신사 장비] |
| ③ | 업로드 속도 | 192.168.0.16 에서 속도 측정 사이트 | 청중 수 × 청중 1인당 비트레이트 이상 [TBD : 1인당 비트레이트 실측 후 확정 — 참고로 1.5Mbps 가정 시 청중 30명 ≈ 45Mbps] |
| ④ | 그 PC 여유 자원 | 작업 관리자 | Pi Node 를 포함해 CPU·메모리가 상시 포화되지 않음 [TBD : 엔진 부하 실측 후 기준 확정] |
| ⑤ | 공유기 포트포워딩 메뉴 | 공유기 관리 화면 | Pi Node 용 31400~31409 설정이 이미 있으면 같은 화면 사용 |

## 3. 공유기 설정 (마스터)

공유기 관리 화면 → 포트포워딩(NAT/가상 서버) 에 2줄 추가합니다. Pi Node 줄은 건드리지 않습니다.

| 이름 | 프로토콜 | 외부 포트 | 내부 IP | 내부 포트 |
|---|---|---|---|---|
| galapagos-wss | TCP | 443 | 192.168.0.16 | 443 |
| galapagos-media | UDP | 7882 | 192.168.0.16 | 7882 |

- 192.168.0.16 이 바뀌지 않도록 공유기의 "고정 IP 할당(DHCP 예약)"에 그 PC 를 등록합니다.
- 80번은 열지 않습니다. Caddy 는 443 하나로 인증서를 받을 수 있습니다(TLS-ALPN 방식, 출처 : caddyserver.com/docs/automatic-https, 확인일 2026-10-25).

## 4. 192.168.0.16 설치 — Windows 기준

### 4.1 DuckDNS 이름 만들기 (마스터, 3분)
1. https://www.duckdns.org 접속 → Google 등으로 로그인
2. sub domain 칸에 이름 입력(예 `seminar-galapagos`) → add domain
3. 화면의 **token** 은 비밀값 — 저장소·채팅에 붙이지 않고 그 PC 의 `duckdns.cmd` 에만 둡니다

### 4.2 파일 준비·배치
1. **엔진 파일** : 아소카가 `media/` 에서 `CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/galapagos.exe ./cmd/galapagos` 로 빌드해 전달(4.7 표의 빌드는 모두 이 명령. **v1.3(`45541466…`)부터는 커밋을 마친 깨끗한 작업 트리에서** 빌드 — `go version -m bin/galapagos.exe` 가 `vcs.modified=false` 이고, 그 커밋을 checkout 해 이 명령으로 다시 빌드하면 같은 SHA256(다른 폴더에서 재현 확인 2026-10-27). 그 전 빌드는 미커밋 작업 트리였을 수 있다 — 4.7 표 커밋 칸 참고) [확인중 : 전달 경로 — USB 또는 공유 폴더]
2. **Caddy** : https://caddyserver.com/download 에서 Windows amd64 공식 파일을 받아 이름을 `caddy.exe` 로 바꿉니다
3. **입장권 비밀키** : 마스터 PC 에서 `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` 로 만들고, Vercel 과 `run-engine.cmd` 두 곳에 직접 입력합니다(채팅·저장소·커밋 메시지에 붙이지 않음)
4. 폴더 `C:\galapagos\` 를 만들고 아래 파일을 둔 뒤, **폴더 권한을 관리자·SYSTEM 만으로 제한**합니다(다른 계정이 파일을 바꾸거나 비밀값을 읽지 못하게). 관리자 PowerShell :
   ```
   icacls C:\galapagos /inheritance:r /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F"
   ```

`Caddyfile`
```
seminar-galapagos.duckdns.org {
	# 신호·상태 확인만 바깥에 연다(관리 API /admin/ 등은 막음)
	@public path /signal /healthz
	handle @public {
		reverse_proxy 127.0.0.1:7880
	}
	handle {
		respond 404
	}
}
```

`run-engine.cmd` (비밀값은 이 파일에만. 엔진이 죽으면 5초 뒤 다시 켜는 반복 구조)
- `..._HERE` 를 실제 값으로 바꿉니다. **cmd 에서 `<` `>` 는 파일 입출력 기호**라 값에 남으면 그 줄이 깨집니다
- `PUBLIC_IP_HERE` = 2절 ② 공인 IP / `TOKEN_SECRET_HERE` = 마스터 PC `sitemap/seminar.pi/.env.vercel-prod` 의 같은 키 값(Vercel 과 같은 값)
- 일반 브라우저 시험도 하면 Origin 뒤에 쉼표로 Vercel 도메인(`https://xxx.vercel.app`)을 붙입니다(5절)
```
@echo off
rem MEDIA_ENV=production : 개발용 입장(MEDIA_DEV_TICKET)을 코드에서 강제로 끔 — 인터넷에 여는 엔진이라 필수
set MEDIA_ENV=production
set MEDIA_LISTEN=127.0.0.1:7880
set MEDIA_UDP_PORT=7882
set MEDIA_PUBLIC_IP=PUBLIC_IP_HERE
set MEDIA_TOKEN_SECRET=TOKEN_SECRET_HERE
set MEDIA_ALLOWED_ORIGINS=https://seminarz.vercel.app,https://seminar0532.pinet.com
:loop
C:\galapagos\galapagos.exe >> C:\galapagos\engine.log 2>&1
echo %date% %time% engine exited - restart in 5s >> C:\galapagos\engine.log
timeout /t 5 /nobreak > nul
goto loop
```

`run-caddy.cmd` (같은 반복 구조)
```
@echo off
:loop
C:\galapagos\caddy.exe run --config C:\galapagos\Caddyfile >> C:\galapagos\caddy.log 2>&1
timeout /t 5 /nobreak > nul
goto loop
```

`duckdns.cmd` (공인 IP 가 바뀌면 이름을 새 IP 로 갱신 — `ip=` 를 비우면 요청을 보낸 IP 로 갱신, 출처 : duckdns.org/spec.jsp, 확인일 2026-10-25. curl 은 Windows 10 1803 이상 기본 포함)
```
@echo off
curl -s "https://www.duckdns.org/update?domains=seminar-galapagos&token=DUCKDNS_TOKEN_HERE&ip=" >> C:\galapagos\duckdns.log
```

### 4.3 방화벽 (관리자 PowerShell)
```
netsh advfirewall firewall add rule name="Galapagos UDP 7882" dir=in action=allow protocol=UDP localport=7882
netsh advfirewall firewall add rule name="Galapagos Caddy 443" dir=in action=allow protocol=TCP localport=443
```

### 4.4 자동 시작 (작업 스케줄러, 추가 프로그램 없음)
관리자 PowerShell 에서 3개 등록 — PC 를 켜면 자동 실행, DuckDNS 는 5분마다.
```
schtasks /Create /TN "Galapagos Engine" /TR "C:\galapagos\run-engine.cmd" /SC ONSTART /RU SYSTEM
schtasks /Create /TN "Galapagos Caddy"  /TR "C:\galapagos\run-caddy.cmd" /SC ONSTART /RU SYSTEM
schtasks /Create /TN "Galapagos DuckDNS" /TR "C:\galapagos\duckdns.cmd" /SC MINUTE /MO 5 /RU SYSTEM
```
작업 스케줄러는 기본값으로 **72시간이 지나면 작업을 멈춥니다**. 엔진·Caddy 는 계속 켜져 있어야 하므로 이어서 실행합니다. 프로그램이 죽었을 때 다시 켜는 일은 위 `.cmd` 의 반복 구조가 맡고, 아래 재시작 설정은 작업 자체가 시작에 실패한 경우를 위한 보조입니다.
```
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Set-ScheduledTask -TaskName 'Galapagos Engine' -Settings $s
Set-ScheduledTask -TaskName 'Galapagos Caddy' -Settings $s
```
등록 뒤 한 번 수동 실행 : `schtasks /Run /TN "Galapagos DuckDNS"` → `"Galapagos Caddy"` → `"Galapagos Engine"` 순서.

⚠ 시험 기간에는 SYSTEM 계정으로 실행합니다(설정이 가장 간단). 인터넷에 열린 프로그램이 SYSTEM 권한을 가지므로, 운영으로 쓰게 되면 권한이 낮은 전용 계정으로 바꿉니다 [확인중 : 계정 방식].

### 4.5 동작 확인

| 확인 | 어디서 | 기대 | 실패하면 |
|---|---|---|---|
| `C:\galapagos\duckdns.log` | 192.168.0.16 | `OK` | `KO` → 토큰·도메인 이름 확인 |
| `C:\galapagos\caddy.log` | 192.168.0.16 | `certificate obtained successfully` 와 도메인 이름 | DuckDNS 갱신(`OK`)과 공유기 TCP 443 포워딩부터 확인 |
| `C:\galapagos\engine.log` | 192.168.0.16 | `Galápagos 대기 http 127.0.0.1:7880 · udp 7882` | 기동 거부 문구 확인(`MEDIA_ALLOWED_ORIGINS` 비어 있으면 거부) |
| `http://127.0.0.1:7880/healthz` | 192.168.0.16 브라우저 | `ok` | 엔진 미기동 → 4.6 |
| `https://seminar-galapagos.duckdns.org/healthz` | 휴대폰 LTE(와이파이 끔) | `ok` + 자물쇠(인증서 정상) | 위 caddy.log |

### 4.6 엔진이 안 뜰 때 (healthz 접속 안 됨)

관리자 cmd 에서 반복 없이 **한 번 직접 실행**하면 거부 사유가 화면에 바로 나옵니다.
```
schtasks /End /TN "Galapagos Engine"
taskkill /IM galapagos.exe /F
cd /d C:\galapagos
findstr /B /C:"set " run-engine.cmd > %TEMP%\genv.cmd
call %TEMP%\genv.cmd
del %TEMP%\genv.cmd
galapagos.exe
```

| 화면 문구 | 원인 | 조치 |
|---|---|---|
| `Galápagos 대기 http 127.0.0.1:7880 · udp 7882` | 엔진은 정상 — 작업 스케줄러 쪽 문제 | `schtasks /Query /TN "Galapagos Engine" /V /FO LIST` 의 '마지막 결과' 확인, `schtasks /Run` 으로 시작했는지 확인 |
| `MEDIA_TOKEN_SECRET 은 32자 이상 필수` | 비밀키가 비었거나 잘림·`_HERE` 그대로 | 값 다시 붙여넣기(앞뒤 공백 없이) |
| `MEDIA_ALLOWED_ORIGINS 필수` | Origin 빈 값 | 4.2 형식으로 입력 |
| `API 구성 실패` · `bind` · `Only one usage of each socket address` | `MEDIA_PUBLIC_IP` 형식 오류이거나 7880·7882 를 다른 프로그램이 사용 | IP 는 숫자 4덩어리만, `netstat -ano \| findstr ":7880 :7882"` 로 점유 프로세스 확인 |
| `지정된 파일을 찾을 수 없습니다` | `set` 줄에 `<` `>` 가 남음 | 4.2 의 `_HERE` 치환 확인 |
| 실행 차단 경고·아무 반응 없음 | 다른 PC 에서 옮긴 실행 파일 차단(SmartScreen) | 파일 속성 → 하단 '차단 해제' 체크 |

확인 뒤 `Ctrl+C` 로 끄고 `schtasks /Run /TN "Galapagos Engine"` 로 다시 맡깁니다. `engine.log` 는 관리자 권한으로만 열립니다(4.2 폴더 권한).

### 4.7 엔진 교체 (새 빌드로 바꿀 때)

화면(Vercel)은 push 하면 자동 배포되지만 **엔진은 이 PC 에서 직접 바꿔야** 합니다. 화면이 새 기능(v1.1 채팅·손들기·반응·무대 초대·세미나 종료, v1.2 사회자 음소거·레이아웃·발언자, v1.3 자막·녹화/기록 상태·새로고침 중계 `app`)을 쓰는데 엔진이 옛 빌드면 그 기능만 실패합니다(기본 입장·영상은 동작).

1. 마스터 PC 에서 새 파일 : `sitemap/seminar.pi/media/bin/galapagos.exe` (아소카가 빌드해 둠 — 아래 SHA256 확인). `bin/` 은 git 에 올라가지 않으므로 작업 폴더(worktree)를 정리했거나 다른 체크아웃이면 파일이 없거나 옛 빌드일 수 있다 — **없거나 SHA256 이 다르면 표의 커밋을 checkout 해 4.2 명령으로 다시 빌드**(같은 SHA256 이 나온다)
2. 192.168.0.16 관리자 cmd :
   ```
   schtasks /End /TN "Galapagos Engine"
   taskkill /IM galapagos.exe /F
   copy /Y <USB 경로>\galapagos.exe C:\galapagos\galapagos.exe
   schtasks /Run /TN "Galapagos Engine"
   ```
3. 확인 : `http://127.0.0.1:7880/healthz` → `ok`, `C:\galapagos\engine.log` 마지막 줄 `Galápagos 대기 …`
4. 파일 확인(선택) : PowerShell `Get-FileHash C:\galapagos\galapagos.exe` 가 빌드 기록의 SHA256 과 같은지

`8ab7e634` 빌드는 저장소 밖 폴더에 교체 절차서가 함께 있습니다 : `C:/Users/anaki/workspace/galapagos-build/8ab7e634/SWAP.md` (파일 확인·백업·교체·env·정상 확인·되돌리기, 같은 폴더 `galapagos.exe`·`SHA256SUMS.txt`). `MEDIA_ADMIN_SECRET` 은 B-1 지침(양쪽 같은 값 또는 양쪽 다 뺌)을 따릅니다.

| 빌드 | 커밋 | SHA256 |
|---|---|---|
| **2026-10-29 21:53 (v1.3.3 개최자 부재 정리 — 입장권 `host` 클레임, 개최자가 방에 6분 넘게 없으면 엔진이 방을 닫음 `1f23d219`, `8ab7e634` 의 녹화 수정 포함)** — 새 빌드, 교체 대기(`8ab7e634` 대신 이것 설치). 신호 메시지·env·관리 API 변경 없음(입장권 선택 클레임 1개 추가, 구 화면 서버와도 호환), Go 1.27.0, 산출물 `C:/Users/anaki/workspace/galapagos-build/1f23d219/galapagos.exe`(같은 폴더 `SHA256SUMS.txt`) · 교체 절차는 `8ab7e634/SWAP.md` 와 같음 · 실행 확인 [확인중 : 미검증 — 집 PC 교체 후 healthz·입장·개최자 퇴장 6분 뒤 방 닫힘] | `1f23d219` (master, `vcs.modified=false`, 깨끗한 작업 트리 빌드) | `d2dcbbd735ef4d88dc9b5768c11a20ea8dbe53e0c65e6d188342f543ed548dd9` |
| 2026-10-29 13:16 (`27a18b31` 이후 M3 ⑥ 비활성 레이어 제외 `05d63243` — 할당기 밖 녹화 Consumer 가 상위 레이어 끊김에 멈추던 경로 수정 · 호출자 없는 공개 `Room.Consume` 삭제 `ced50e83`) — `1f23d219` 빌드로 대체(아직 교체 전이면 이것 대신 위 빌드 설치). 신호 프로토콜·env·관리 API 변경 없음, Go 1.27.0, 산출물 `C:/Users/anaki/workspace/galapagos-build/8ab7e634/galapagos.exe` · 실행 확인 [확인중 : 미검증 — 집 PC 교체 후 healthz·입장] | `8ab7e634` (master, `vcs.modified=false`, 깨끗한 작업 트리 빌드) | `ce249a33a54bb5b54e3b08cef14d0d4d1d155cc761afbb8410d6c402fd56b94f` |
| 2026-10-28 01:49 (v1.3.2 + 관리 API `GET /admin/rooms/{id}/peers/{sub}` 무대 역할·발표자 유무 조회 — 음성 자막 무대 관문 D-1) — `8ab7e634` 빌드로 대체(관리 키는 B-1 지침) | `27a18b31` (master 병합 커밋, 엔진 변경 야간 시험 r3 T03, `vcs.modified=false`, 깨끗한 임시 worktree 빌드) | `225efa5e6a21c1bd55b9c99221e6f03e946e991176c3e6b6afd9036af2cea83a` |
| 2026-10-27 23:40 (v1.3.2 `app.send` 'state' 속도 한도 자막과 분리 — 녹화·AI 기록 고지 RATE_LIMITED 차단) — v1.3.2 + 관리 API 빌드로 대체 | `cf2fe499` (master 병합 커밋, 엔진 변경 `8e178933`, `vcs.modified=false`) | `d76c6bc0bb371ec18f112e553abb78fe1aac7570d491d8221e73cf711e5b21ee` |
| 2026-10-27 20:55 (v1.3.1 범용 중계 `app` + 잘못된 UTF-8 연결 종료) — v1.3.2 로 대체 | `4e33bbad` (브랜치 `feat/seminar-app-relay`, `vcs.modified=false`, 재현 확인) | `a11f7f367d84c03d1061458b4e1d9b8601b276848a4d71730524c7b8896df826` |
| 2026-10-27 20:37 (v1.3) — **폐기, 설치 금지** : 잘못된 UTF-8 `app.send` 를 그대로 중계(청중 1명이 방 전원 연결을 끊을 수 있음, SIGNAL_API v1.3.1) | `21844766` (`vcs.modified=false`) | `45541466cd242d665285d45c161f3b62c4cd4cd8c2a04cea6d06fcbbdb104e98` |
| 2026-10-27 07:52 (v1.2 + LAN 후보) — 현재 집 PC | `c5f42247` + 미커밋 수정(LAN 후보 Append — `9d8eea86` 커밋 07:55 전 빌드, `vcs.modified=true`) | `12cfde8b6be2d5271df817d261becea7b6b73243b3f27f429392cfb7e87598a9` |
| 2026-10-27 01:45 (v1.2) — 구, 같은 집 PC 끊김 | `7f623e75` | `bdcbe4896908fa2be09fc5df30aaa6b84d34a21f16c55c51a8f35a928441cbc0` |

## 5. 앱(Vercel) 쪽 설정 — 아소카가 코드, 마스터가 Vercel 값

| 항목 | 값 | 담당 |
|---|---|---|
| Vercel `NEXT_PUBLIC_MEDIA_WS_URL` | `wss://seminar-galapagos.duckdns.org/signal` | 마스터 등록 → Redeploy |
| Vercel `MEDIA_TOKEN_SECRET` | 엔진과 같은 값(4.2-3) | 마스터 |
| `/lab/sfu` 하드코딩 터널 주소 제거 | env 기본값 + 화면 입력 칸 | 아소카 — **완료(2026-10-26)** |
| `/lab/sfu` 가 입장권(`/api/media/ticket`)을 받아 join | 개발용 입장 없이 입장 — 인터넷에 열린 엔진이라 필수 | 아소카 — **완료(2026-10-26)** |
| 엔진 `MEDIA_ALLOWED_ORIGINS` | seminar 앱의 실제 Origin | 형식 `https://호스트`(경로·끝 슬래시 없음), 여러 개면 쉼표. 엔진은 문자열 그대로 비교하므로 하나라도 다르면 403 "origin 불허", 비우면 기동 거부 [확인중 : Pi Browser 가 보내는 Origin — 실기기 1회 확인] |

⚠ 엔진을 인터넷에 열 때 개발용 입장(`MEDIA_DEV_TICKET=1`)을 켜면 주소를 아는 누구나 방에 들어옵니다. `run-engine.cmd` 의 `MEDIA_ENV=production` 이 이를 코드에서 막습니다 — 지우지 마세요.

## 6. 시험 순서
0. **선행** : (아소카 코드는 2026-10-26 반영) Vercel `NEXT_PUBLIC_MEDIA_WS_URL`·`MEDIA_TOKEN_SECRET` 등록 + Redeploy. 발표자 휴대폰은 **관리자(ADMIN) 계정**으로 로그인(발표 입장권은 관리자만 발급), 청중은 아무 계정으로 로그인
1. 4.5 확인 5개 통과
2. **발표자·청중 모두 LTE(와이파이 끔)** 로 `/ko/lab/sfu` 접속 → 발표자 1 → 청중 2. 청중이 영상을 받으면 **M1 완료**(LAN·LTE 모두 통과)
3. 성공 뒤 집 와이파이 단말을 1대 추가해 헤어핀 NAT 확인(7절) — 실패해도 M1 판정과 무관
4. `tc netem`(M2 손실 시험)은 Linux 전용이라 Windows 에서는 WSL2 또는 부록 방식 [확인중 : 그 PC 의 WSL 설치 여부]. `-race` 는 gcc(MinGW)를 깔면 Windows 에서도 가능

## 7. 주의 (집 PC 를 서버로 쓸 때)

| 항목 | 내용 |
|---|---|
| 같은 집 와이파이 단말 | **영상(UDP 7882)** : 2026-10-27 수정 빌드부터 엔진이 공인 IP 와 함께 **LAN 주소(192.168.0.16 등)도 host 후보로 알립니다**(Append) — 집 안 단말(예 : 마스터 PC)은 헤어핀 NAT 없이 LAN 으로 직접 붙습니다. 이전 빌드는 공인 IP 만 알려, 헤어핀이 안 되면 PC 가 잠깐 접속 뒤 `ICE_FAILED` 로 끊깁니다(2026-10-27 PC 발표자 끊김의 유력 원인 [확인중 : 실기기 재시험]) → **새 빌드로 교체(4.7) 필요**. 엔진 PC 의 가상 어댑터(WSL·Hyper-V·VPN) 주소도 SDP 에 함께 노출됩니다. **신호(wss)** 는 cloudflared 터널이라 헤어핀과 무관 |
| 공인 IP 변경 | 통신사가 IP 를 바꾸면 DuckDNS 는 5분 안에 따라가지만, 엔진의 `MEDIA_PUBLIC_IP` 는 수동 수정 + 엔진 재시작 필요(자동화는 후속) |
| Pi Node 영향 | 영상 송출이 업로드 대역폭·CPU 를 나눠 씀 → 세미나 중 Pi Node 동작에 영향이 있을 수 있음 |
| 노출 범위 | 0~4절 방식 : 공유기에서 TCP 443·UDP 7882 두 개만. ★현행(대안 1) : 공유기는 UDP 7882 하나, 신호는 터널이 엔진의 **모든 HTTP 경로**를 공개하므로 `/admin/` 도 닿음 — `MEDIA_ADMIN_SECRET` 은 B-1 지침대로 엔진·Vercel 양쪽에 같은 무작위 32바이트 이상 값(Bearer 없으면 401) 또는 양쪽 다 뺌(`/admin/` 404). 그 PC 의 공유 폴더·원격 접속은 열지 않음 |
| 통신사 약관 | 가정용 회선에서 서버·상업 서비스 운영이 제한될 수 있음 [확인중 : 통신사 약관] — 시험용으로만, 운영은 VM |
| 정전·재부팅 | 작업 스케줄러가 켜질 때 자동 실행. 정전이 잦으면 VM |

## 8. 이 방식의 위치
- **지금** : 집 PC 로 M1 LTE·외부 시험(비용 0원)
- **청중 30명·운영** : 업로드 대역폭·안정성 때문에 클라우드 VM(C-5) — 엔진은 같은 프로그램이라 옮기기만 하면 됨
- 2절 ② 에서 CGNAT 로 판정되면 이 가이드는 쓸 수 없음 → 바로 VM

## 부록 — 192.168.0.16 이 Linux 라면
- 엔진 : 아소카가 `GOOS=linux GOARCH=amd64` 로 빌드 → `/opt/galapagos/galapagos`
- 자동 시작 : systemd 서비스(`Restart=always`, 전용 저권한 사용자, 환경변수는 `/etc/galapagos.env` 권한 600, `MEDIA_ENV=production` 포함)
- Caddy : 배포판 패키지 설치, `/etc/caddy/Caddyfile` 에 4.2 와 같은 내용
- 방화벽 : `ufw allow 443/tcp`, `ufw allow 7882/udp`
- 장점 : gcc 를 깔면 `go test -race`, `tc netem`(M2 손실 시험)까지 이 PC 에서 가능
