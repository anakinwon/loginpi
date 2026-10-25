# 집 상시 PC(192.168.0.8)에 Galápagos 엔진 올리기 — 외부 접속 가이드

> 작성 2026-10-25 · 대상 : 마스터 집 네트워크의 상시 가동 PC `192.168.0.8`(Pi Node 실행 중) · 관련 결정 C-5(VM) 대안
> 목적 : 클라우드 VM 대신 집 PC로 **M1 LTE 시험을 먼저** 진행한다. M2 손실 시험은 그 PC 의 OS 확인 뒤(6절 4번). 운영 서비스는 VM 권장(8절)

## 0. 한눈에 보기

```
[외부 휴대폰(LTE)]
   │ ① 신호 wss://<이름>.duckdns.org/signal  (TCP 443)
   │ ② 영상 UDP <공인 IP>:7882
   ▼
[집 공유기]  ── 포트포워딩 : TCP 443, UDP 7882 → 192.168.0.8
   ▼
[192.168.0.8 상시 PC]
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
| 192.168.0.8 TCP 31401 | 열림 | Pi Node 동작 중 |
| TCP 22(SSH)·3389(원격 데스크톱)·5985·445 | 닫힘 | 열린 원격 접속 포트 없음(바깥으로 연결하는 원격 앱 여부는 미확인) → 설치는 그 PC 앞에서 |
| TCP 80·443·2375 | 닫힘 | Caddy 가 443 을 쓸 수 있음(다른 프로그램이 점유하지 않음) |
| ping | 응답 없음 | Windows 방화벽 기본값으로 보임 [확인중 : OS] |
| 이 집의 공인 IP | 115.86.x.x | 포트포워딩 가능 여부 판정은 2절 ② 에서 |

## 2. 마스터 사전 점검 (10분)

| # | 확인할 것 | 방법 | 통과 기준 |
|---|---|---|---|
| ① | 192.168.0.8 의 OS | 그 PC 화면 | Windows 면 4절, Linux 면 부록 |
| ② | 공유기 WAN IP | 공유기 관리 화면(보통 192.168.0.1) → 인터넷/WAN 정보의 IP 를 https://api.ipify.org 값과 비교 | **같으면 OK** · WAN IP 가 100.64~100.127 로 시작하면 통신사 공유 IP(CGNAT) → 포트포워딩 불가, 8절 VM · 192.168·10·172.16~31 로 시작하면 이중 공유기(통신사 모뎀 + 개인 공유기) → 상위 장비에도 포트포워딩 또는 브리지 모드 [확인중 : 통신사 장비] |
| ③ | 업로드 속도 | 192.168.0.8 에서 속도 측정 사이트 | 청중 수 × 청중 1인당 비트레이트 이상 [TBD : 1인당 비트레이트 실측 후 확정 — 참고로 1.5Mbps 가정 시 청중 30명 ≈ 45Mbps] |
| ④ | 그 PC 여유 자원 | 작업 관리자 | Pi Node 를 포함해 CPU·메모리가 상시 포화되지 않음 [TBD : 엔진 부하 실측 후 기준 확정] |
| ⑤ | 공유기 포트포워딩 메뉴 | 공유기 관리 화면 | Pi Node 용 31400~31409 설정이 이미 있으면 같은 화면 사용 |

## 3. 공유기 설정 (마스터)

공유기 관리 화면 → 포트포워딩(NAT/가상 서버) 에 2줄 추가합니다. Pi Node 줄은 건드리지 않습니다.

| 이름 | 프로토콜 | 외부 포트 | 내부 IP | 내부 포트 |
|---|---|---|---|---|
| galapagos-wss | TCP | 443 | 192.168.0.8 | 443 |
| galapagos-media | UDP | 7882 | 192.168.0.8 | 7882 |

- 192.168.0.8 이 바뀌지 않도록 공유기의 "고정 IP 할당(DHCP 예약)"에 그 PC 를 등록합니다.
- 80번은 열지 않습니다. Caddy 는 443 하나로 인증서를 받을 수 있습니다(TLS-ALPN 방식, 출처 : caddyserver.com/docs/automatic-https, 확인일 2026-10-25).

## 4. 192.168.0.8 설치 — Windows 기준

### 4.1 DuckDNS 이름 만들기 (마스터, 3분)
1. https://www.duckdns.org 접속 → Google 등으로 로그인
2. sub domain 칸에 이름 입력(예 `seminar-galapagos`) → add domain
3. 화면의 **token** 은 비밀값 — 저장소·채팅에 붙이지 않고 그 PC 의 `duckdns.cmd` 에만 둡니다

### 4.2 파일 준비·배치
1. **엔진 파일** : 아소카가 `media/` 에서 `GOOS=windows GOARCH=amd64 go build -o galapagos.exe ./cmd/galapagos` 로 빌드해 전달 [확인중 : 전달 경로 — USB 또는 공유 폴더]
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
```
@echo off
rem MEDIA_ENV=production : 개발용 입장(MEDIA_DEV_TICKET)을 코드에서 강제로 끔 — 인터넷에 여는 엔진이라 필수
set MEDIA_ENV=production
set MEDIA_LISTEN=127.0.0.1:7880
set MEDIA_UDP_PORT=7882
set MEDIA_PUBLIC_IP=<공인 IP — 2절 ② 값>
set MEDIA_TOKEN_SECRET=<4.2-3 에서 만든 값, Vercel 과 같은 값>
set MEDIA_ALLOWED_ORIGINS=<seminar 앱 주소들, 쉼표 구분 — 5절 형식>
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
curl -s "https://www.duckdns.org/update?domains=seminar-galapagos&token=<토큰>&ip=" >> C:\galapagos\duckdns.log
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
| `C:\galapagos\duckdns.log` | 192.168.0.8 | `OK` | `KO` → 토큰·도메인 이름 확인 |
| `C:\galapagos\caddy.log` | 192.168.0.8 | `certificate obtained successfully` 와 도메인 이름 | DuckDNS 갱신(`OK`)과 공유기 TCP 443 포워딩부터 확인 |
| `C:\galapagos\engine.log` | 192.168.0.8 | `Galápagos 대기 http 127.0.0.1:7880 · udp 7882` | 기동 거부 문구 확인(`MEDIA_ALLOWED_ORIGINS` 비어 있으면 거부) |
| `http://127.0.0.1:7880/healthz` | 192.168.0.8 브라우저 | `ok` | 엔진 미기동 |
| `https://seminar-galapagos.duckdns.org/healthz` | 휴대폰 LTE(와이파이 끔) | `ok` + 자물쇠(인증서 정상) | 위 caddy.log |

## 5. 앱(Vercel) 쪽 설정 — 아소카가 코드, 마스터가 Vercel 값

| 항목 | 값 | 담당 |
|---|---|---|
| Vercel `NEXT_PUBLIC_MEDIA_WS_URL` | `wss://seminar-galapagos.duckdns.org/signal` | 마스터 등록 → Redeploy |
| Vercel `MEDIA_TOKEN_SECRET` | 엔진과 같은 값(4.2-3) | 마스터 |
| `/lab/sfu` 하드코딩 터널 주소 제거 | env 로 대체 | 아소카 |
| `/lab/sfu` 가 입장권(`/api/media/ticket`)을 받아 join | 개발용 입장 없이 입장 — 인터넷에 열린 엔진이라 필수 | 아소카(코드 추가 필요) |
| 엔진 `MEDIA_ALLOWED_ORIGINS` | seminar 앱의 실제 Origin | 형식 `https://호스트`(경로·끝 슬래시 없음), 여러 개면 쉼표. 엔진은 문자열 그대로 비교하므로 하나라도 다르면 403 "origin 불허", 비우면 기동 거부 [확인중 : Pi Browser 가 보내는 Origin — 실기기 1회 확인] |

⚠ 엔진을 인터넷에 열 때 개발용 입장(`MEDIA_DEV_TICKET=1`)을 켜면 주소를 아는 누구나 방에 들어옵니다. `run-engine.cmd` 의 `MEDIA_ENV=production` 이 이를 코드에서 막습니다 — 지우지 마세요.

## 6. 시험 순서
0. **선행** : 5절 아소카 코드 반영 + Vercel `NEXT_PUBLIC_MEDIA_WS_URL`·`MEDIA_TOKEN_SECRET` 등록 + Redeploy. 발표자 휴대폰은 **관리자(ADMIN) 계정**으로 로그인(발표 입장권은 관리자만 발급), 청중은 아무 계정으로 로그인
1. 4.5 확인 5개 통과
2. **발표자·청중 모두 LTE(와이파이 끔)** 로 `/ko/lab/sfu` 접속 → 발표자 1 → 청중 2. 청중이 영상을 받으면 **M1 완료**(LAN·LTE 모두 통과)
3. 성공 뒤 집 와이파이 단말을 1대 추가해 헤어핀 NAT 확인(7절) — 실패해도 M1 판정과 무관
4. `tc netem`(M2 손실 시험)은 Linux 전용이라 Windows 에서는 WSL2 또는 부록 방식 [확인중 : 그 PC 의 WSL 설치 여부]. `-race` 는 gcc(MinGW)를 깔면 Windows 에서도 가능

## 7. 주의 (집 PC 를 서버로 쓸 때)

| 항목 | 내용 |
|---|---|
| 같은 집 와이파이 단말 | 엔진은 공인 IP 를 알리고 앱은 공인 주소로 접속하므로, 공유기가 "자기 공인 IP 로 되돌아오는 연결(헤어핀 NAT)"을 지원해야 집 안에서도 **신호(wss 443)·영상(UDP 7882) 모두** 붙습니다 [확인중 : 공유기 기종]. 안 되면 집 안 시험은 지금 방식(마스터 PC + 임시 터널) 유지 |
| 공인 IP 변경 | 통신사가 IP 를 바꾸면 DuckDNS 는 5분 안에 따라가지만, 엔진의 `MEDIA_PUBLIC_IP` 는 수동 수정 + 엔진 재시작 필요(자동화는 후속) |
| Pi Node 영향 | 영상 송출이 업로드 대역폭·CPU 를 나눠 씀 → 세미나 중 Pi Node 동작에 영향이 있을 수 있음 |
| 노출 범위 | 공유기에서 여는 포트는 TCP 443·UDP 7882 두 개뿐. 그 PC 의 공유 폴더·원격 접속은 열지 않음 |
| 통신사 약관 | 가정용 회선에서 서버·상업 서비스 운영이 제한될 수 있음 [확인중 : 통신사 약관] — 시험용으로만, 운영은 VM |
| 정전·재부팅 | 작업 스케줄러가 켜질 때 자동 실행. 정전이 잦으면 VM |

## 8. 이 방식의 위치
- **지금** : 집 PC 로 M1 LTE·외부 시험(비용 0원)
- **청중 30명·운영** : 업로드 대역폭·안정성 때문에 클라우드 VM(C-5) — 엔진은 같은 프로그램이라 옮기기만 하면 됨
- 2절 ② 에서 CGNAT 로 판정되면 이 가이드는 쓸 수 없음 → 바로 VM

## 부록 — 192.168.0.8 이 Linux 라면
- 엔진 : 아소카가 `GOOS=linux GOARCH=amd64` 로 빌드 → `/opt/galapagos/galapagos`
- 자동 시작 : systemd 서비스(`Restart=always`, 전용 저권한 사용자, 환경변수는 `/etc/galapagos.env` 권한 600, `MEDIA_ENV=production` 포함)
- Caddy : 배포판 패키지 설치, `/etc/caddy/Caddyfile` 에 4.2 와 같은 내용
- 방화벽 : `ufw allow 443/tcp`, `ufw allow 7882/udp`
- 장점 : gcc 를 깔면 `go test -race`, `tc netem`(M2 손실 시험)까지 이 PC 에서 가능
