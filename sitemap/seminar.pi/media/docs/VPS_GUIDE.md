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
