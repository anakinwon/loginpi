# Galápagos 엔진 — Vultr 서울 VPS 이전 절차

> 작성 2026-10-31 · 결정 : 마스터(Vultr 서울 $5, 집 PC + 임시 터널 대체) · 설치 스크립트 `../scripts/vps-setup.sh` · 이전 방식 = [HOME_NODE_GUIDE](HOME_NODE_GUIDE.md)

## 0. 바뀌는 것

| 항목 | 지금(집 PC) | VPS |
|---|---|---|
| 신호 주소 | `wss://<임시>.trycloudflare.com/signal` — 재시작마다 바뀜 | `wss://<공인IP>.sslip.io/signal` — **고정** |
| TLS | Cloudflare 터널 | Caddy 자동 인증서(Let's Encrypt) |
| 영상 UDP | 공유기 포워딩 7882 | VPS 공인 IP 7882 직통 |
| 자동 시작 | 작업 스케줄러 | systemd `Restart=always` |
| 엔진 | `galapagos.exe`(Windows) | 같은 소스의 Linux 빌드 |

## 1. VM 만들기 (마스터 — Vultr 콘솔)

1. Deploy → **Cloud Compute – Shared CPU** → Location **Seoul**
2. Plan : **Regular Performance $5**(1 vCPU·1GB, IPv4 포함 — 마스터 확정 2026-10-31, $3.50 512MB 대신 여유 메모리)
3. OS : **Ubuntu 24.04 LTS x64**
4. 부가 옵션 : Auto Backups **끔**(유료), IPv6 켜도 무방
5. SSH Key : 있으면 등록(권장), 없으면 root 비밀번호(배포 후 화면에 표시)
6. Hostname `galapagos` → Deploy → 상태 Running 확인 후 **공인 IPv4** 메모

## 2. 올리기·설치 (마스터 PC PowerShell)

빌드 위치 : `C:\Users\anaki\workspace\galapagos-build\vultr\` (`galapagos` Linux 실행 파일 + `vps-setup.sh`)

```powershell
cd C:\Users\anaki\workspace\galapagos-build\vultr
scp galapagos vps-setup.sh root@<공인IP>:/root/
ssh root@<공인IP> "bash /root/vps-setup.sh"
```

- 중간에 `MEDIA_TOKEN_SECRET`·`MEDIA_ADMIN_SECRET` 입력을 묻는다 — Vercel `seminar` 과 **같은 값**을 붙여넣기(화면에 안 보임). 집 PC `run-engine.cmd` 에 있는 값과 같다
- 끝에 `healthz : ok` 와 새 `wss://…/signal` 주소가 나오면 성공. `실패` 면 1분 뒤 `curl https://<공인IP>.sslip.io/healthz`

## 3. 앱 연결 (마스터 — Vercel)

1. `seminar` 프로젝트 → Settings → Environment Variables → `NEXT_PUBLIC_MEDIA_WS_URL` = `wss://<공인IP>.sslip.io/signal`
2. Deployments → Redeploy(빌드 시점에 박히는 `NEXT_PUBLIC_` 값이라 재배포 필수)
3. 로컬 `.env.local` 의 같은 키도 교체

## 4. 정상 확인

| 확인 | 기대 |
|---|---|
| `https://<공인IP>.sslip.io/healthz` | `ok` |
| `https://<공인IP>.sslip.io/admin/rooms` (Bearer 없이) | 401 (ADMIN 키 비웠으면 404) |
| 휴대폰 **LTE**(와이파이 끔)로 세미나 입장·발표 | 영상·음성 정상, "화상 서버에 연결하지 못했습니다" 없음 |
| `ssh root@<IP> journalctl -u galapagos -n 30` | `Galápagos 대기 http 127.0.0.1:7880 · udp 7882` |

## 5. 운영

- 엔진 교체 : 새 `galapagos` 를 scp → `install -m 755 /root/galapagos /opt/galapagos/galapagos && systemctl restart galapagos`
- 로그 : `journalctl -u galapagos -f`
- 비밀값 변경 : `nano /etc/galapagos.env` → `systemctl restart galapagos`
- 공인 IP 가 바뀌면(VM 재생성) 스크립트를 다시 돌리고 3절 반복 — 같은 VM 은 IP 가 유지된다
- 트래픽 : Vultr 콘솔 Usage 에서 월 사용량 확인(요금제 포함량 [확인중 : 콘솔 표시], 초과 $0.01/GB [확인중 : 서울])

## 6. 되돌리기

Vercel `NEXT_PUBLIC_MEDIA_WS_URL` 을 집 PC 터널 주소로 되돌리고 Redeploy(집 PC 엔진·터널은 이전 확인 전까지 끄지 않는다). 이전이 확정되면 집 PC 공유기 UDP 7882 포워딩을 닫는다.

## 7. 알려진 한계

- 1GB 메모리 : 엔진 + Caddy 로 충분하나 서버 녹화(`MEDIA_RECORD_DIR`)는 켜지 않는다(현재 녹화는 브라우저)
- sslip.io : 무료 공용 DNS 에 의존 — 장애 시 접속 불가. 운영 확대 시 자체 도메인으로 교체(Caddyfile 한 줄 + Vercel env)
- Pi Browser Origin : `MEDIA_ALLOWED_ORIGINS` 는 집 PC 와 같은 두 값 — 실기기에서 403 "origin 불허" 가 나면 `journalctl` 의 값을 추가

## 8. 보조 TURN(coturn) — LTE·대칭 NAT 청중 중계 (2026-10-31 아소카, 마스터 위임)

엔진은 full ICE 라 대부분 직결되지만, LTE 대칭 NAT·기업망(UDP 차단)은 TURN 중계가 있어야 붙는다. 같은 VPS 에 coturn 을 함께 올린다(1 vCPU 에 충분 — 상한 `total-quota 40`·사용자당 8 할당·3Mbps).

- **설치·갱신(멱등, 마스터 PC PowerShell)** — 비밀은 `openssl rand -hex 32`(64자 hex) 로 만들어 **VPS 설정 파일과 Vercel 두 곳에만** 둔다. 저장소·메모에 적지 않는다.
  ```powershell
  scp .\sitemap\seminar.pi\media\scripts\vps-turn-setup.sh root@158.247.243.145:/root/
  ssh root@158.247.243.145 'read -rs TURN_SECRET; export TURN_SECRET; bash /root/vps-turn-setup.sh'   # 첫 설치 — 비밀을 붙여넣고 Enter(화면·이력에 안 남음)
  ssh root@158.247.243.145 bash /root/vps-turn-setup.sh                                                  # 재실행(설정 갱신) — 기존 conf 의 비밀을 이어 씀
  ```
  스크립트가 하는 일 : 공인 IPv4 선검사(사설대역이면 중단) → `apt install coturn` → `/etc/turnserver.conf`(3478 udp+tcp, 중계 49160~49200/udp, `use-auth-secret`, `fingerprint`, `no-multicast-peers`, `no-tcp-relay`(TCP 중계로 VPS 자신의 차단 포트에 닿는 경로 차단), 중계 상대 전부 거부 + `allowed-peer-ip=<엔진 공인 IP>` 만 허용(SFU 라 브라우저끼리 안 붙음 — 엔진이 다른 호스트로 가면 그 IP 추가), 자격 증명 username 은 TTL 칸 경계로 고정해 재요청으로 사용자당 할당(8)을 못 비껴감, `no-tls`/`no-dtls` — 443 은 Caddy 가 쓰므로 TLS 는 자체 도메인·5349 인증서 뒤로 보류, `verbose` 는 세션 단위 로그라 부담 없음) → ufw `3478/udp`·`3478/tcp`·`49160:49200/udp` → `systemctl enable --now coturn` → 상태 출력(비밀 미출력).
- **Vercel seminar env** : `TURN_HOST=158.247.243.145.sslip.io`(호스트만 — 포트·스킴 금지, IP 리터럴 대신 호스트명 = iOS LTE DNS64 대비) · `TURN_SECRET=<같은 값>` · (선택) `TURN_CREDENTIAL_TTL`. 바꾸면 **Redeploy**. 등록 후 `/api/media/turn` 이 `turn:<host>:3478?transport=udp|tcp` + `turns:<host>:443` 을 돌려준다(443 은 Caddy → 그 주소만 조용히 실패, 정상).
- **정상 확인** :
  - VPS : `systemctl is-active coturn` = active, `ss -lunp | grep 3478`, `turnutils_uclient -y -n 20 -u probe -w <비밀로 만든 자격> 158.247.243.145`(또는 `-W <비밀>` 로 직접) → `tot_send = tot_recv`, 손실 0. tcp 는 `-t` 추가·사용자명을 바꿔서(사용자당 8 할당 쿼터)
  - 저널 : `journalctl -u coturn -f` 에 `ALLOCATE processed, success` — 실사용 때 사용자명이 `<만료epoch>:<usr_id>` 로 찍힌다. `401 Unauthorized` 가 반복되면 Vercel `TURN_SECRET` 과 conf 의 `static-auth-secret` 불일치
  - 브라우저 : 로그인 뒤 콘솔 `fetch('/api/media/turn',{method:'POST'})` 응답 `iceServers` 에 sslip 호스트 3개, `ttl 3600`. 강제 경유 시험은 `iceTransportPolicy:'relay'` 로 relay 후보(`typ relay`)가 모이는지(2026-10-31 PC Chromium 3개 ✓)
- **직결 vs 중계 판별(LTE 실기기)** : 통화 중 `systemctl stop coturn` → 끊기면 그 청중은 중계 의존, 안 끊기면 직결. 끝나면 `systemctl start coturn`
- **되돌리기** : `ssh root@158.247.243.145 "systemctl disable --now coturn && apt-get purge -y coturn && rm -f /etc/turnserver.conf /root/vps-turn-setup.sh && ufw delete allow 3478/udp && ufw delete allow 3478/tcp && ufw delete allow 49160:49200/udp"` + Vercel `TURN_HOST`·`TURN_SECRET` 삭제 → Redeploy(라우트가 STUN 만 반환). 비밀만 바꿀 때는 새 값으로 스크립트 재실행 + Vercel 갱신 + Redeploy
- **키우기** : relay 동시 20명쯤 넘기면 스크립트 상수(`min-port`/`max-port` 49160~49400, `total-quota`)와 ufw 범위 1줄을 같이 올린다
