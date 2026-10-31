#!/usr/bin/env bash
# 보조 TURN(coturn) 설치 — Galápagos 엔진과 같은 VPS(Vultr 서울 1 vCPU, Ubuntu 26.04)에서 root 로 실행. 다시 돌려도 안전(설정 파일 덮어쓰기·ufw 중복 무해).
# 사용 : PC 에서 `scp vps-turn-setup.sh root@<IP>:/root/` → 첫 설치 `ssh root@<IP> 'read -rs TURN_SECRET; export TURN_SECRET; bash /root/vps-turn-setup.sh'`(비밀 붙여넣기 — 명령줄·이력에 안 남음)
#        재실행(설정 갱신) `ssh root@<IP> bash /root/vps-turn-setup.sh` — 비밀은 기존 conf 에서 이어 씀
# 결과 : turn:<IP>:3478 udp·tcp, relay 49160-49200/udp. 같은 비밀을 Vercel seminar env TURN_SECRET 에, 호스트명을 TURN_HOST 에 등록(src/app/api/media/turn/route.ts HMAC-SHA1 규약).
# 되돌리기 : systemctl disable --now coturn && apt-get purge -y coturn && rm -f /etc/turnserver.conf && ufw delete allow 3478/udp && ufw delete allow 3478/tcp && ufw delete allow 49160:49200/udp
set -euo pipefail

SECRET="${1:-${TURN_SECRET:-}}"
# 재실행(설정 갱신)은 비밀 없이 — 이미 설치된 conf 의 값을 이어 쓴다(비밀을 다시 명령줄에 올리지 않음)
[ -n "$SECRET" ] || SECRET="$(sed -n 's/^static-auth-secret=//p' /etc/turnserver.conf 2>/dev/null | head -1)"
REALM=seminar.pi
MIN_PORT=49160
MAX_PORT=49200

[ "$(id -u)" -eq 0 ] || { echo 'root 로 실행하세요'; exit 1; }
[[ "$SECRET" =~ ^[0-9a-f]{64}$ ]] || { echo '첫 설치는 TURN_SECRET(64자 hex, openssl rand -hex 32)을 환경변수로 주세요(권장 : ssh 안에서 read -rs 로 입력). 재실행은 기존 conf 값을 이어 씁니다'; exit 1; }

# 1) 공인 IPv4 선검사 — NIC 에 공인 IP 가 직접 붙어 있어야 external-ip 없이 동작(사설이면 중단)
IP=$(ip -4 -br addr show scope global | awk '{print $3}' | cut -d/ -f1 | head -1)
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "공인 IPv4 확인 실패: '$IP'"; exit 1; }
case "$IP" in 10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|100.6[4-9].*|100.[7-9][0-9].*|100.1[01][0-9].*|100.12[0-7].*)
  echo "NIC 주소가 사설 대역($IP) — NAT 뒤 VM 이면 external-ip 를 켜야 함(스크립트 수정 후 재실행)"; exit 1;; esac
echo "공인 IP $IP"

# 2) coturn 설치
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y coturn

# 3) /etc/turnserver.conf 전문 — 비밀은 이 스크립트 실행 시점에만 주입(저장소엔 없음)
cat > /etc/turnserver.conf <<CONF
# seminar.pi Galápagos 보조 TURN — coturn, Vultr 서울 1 vCPU. 브라우저 relay 후보 ↔ 엔진 $IP:7882 만 중계
# 생성 : media/scripts/vps-turn-setup.sh (손으로 고치면 다음 실행 때 덮어씀)
listening-port=3478
# TLS·DTLS 는 열지 않음 — 443 은 Caddy(wss 신호)가 점유, 5349 는 인증서 없음 → 라우트의 turns:443 은 보류(브라우저가 조용히 버리고 udp/tcp 3478 로 relay)
no-tls
no-dtls
# 공인 IPv4 에만 바인딩(IPv6·loopback 제외), 중계 주소도 같은 IP
listening-ip=$IP
relay-ip=$IP
# NIC 에 공인 IP 가 직접 할당돼 external-ip 불필요(1단계에서 검사). NAT 뒤 VM 이면 아래 줄 활성
# external-ip=$IP
# relay 포트 최소화($((MAX_PORT - MIN_PORT + 1))개 = 동시 relay 할당 상한, 부족하면 49400 까지 + ufw 동일 변경)
min-port=$MIN_PORT
max-port=$MAX_PORT
fingerprint
# 단기 자격 증명(REST API) — route.ts username=만료epoch:usr_id, credential=base64(HMAC-SHA1(secret, username))
use-auth-secret
static-auth-secret=$SECRET
realm=$REALM
stale-nonce=600
no-multicast-peers
# TCP 중계(RFC 6062)는 안 쓴다 — 자격 있는 사용자가 TURN 을 거쳐 VPS 자신의 ufw 차단 TCP 포트에 닿는 경로를 먼저 막는다(R-P5, 검토 2026-10-31)
no-tcp-relay
no-cli
no-rfc5780
no-stun-backward-compatibility
response-origin-only-with-rfc5780
# 중계 상대는 이 VPS 의 엔진(SFU)뿐 — 브라우저끼리 직접 붙지 않는다. 전부 거부 + 엔진 공인 IP 만 허용(allowed 가 denied 보다 우선, 보안 검토 2026-10-31)
#  엔진이 다른 호스트로 가면 allowed-peer-ip 를 그 IP 로 추가/교체한다
denied-peer-ip=0.0.0.0-255.255.255.255
denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
allowed-peer-ip=$IP
# 1 vCPU·가용 ~700MB — 사용자명(= 사용자 × TTL 칸, route.ts 가 칸 경계로 고정)당 8 세션, 전체 40, 세션당 3Mbps(720p VP8 + Opus)
user-quota=8
total-quota=40
max-bps=3000000
# 로그 = journald(journalctl -u coturn), 파일·stdout 로그 없음. verbose 는 세션 단위(ALLOCATE 성공·401 판별용, 패킷 단위 -V 아님)
verbose
syslog
no-stdout-log
CONF
chown root:turnserver /etc/turnserver.conf
chmod 640 /etc/turnserver.conf

# 4) /etc/default/coturn — 구 패키지(TURNSERVER_ENABLED 게이트)만 해당, 26.04 엔 없음(없으면 무해)
if [ -f /etc/default/coturn ]; then
  sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi

# 5) 방화벽 — 엔진 7882/udp·Caddy 80/443 은 건드리지 않음
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow ${MIN_PORT}:${MAX_PORT}/udp

# 6) 기동
systemctl enable --now coturn
systemctl restart coturn
sleep 1

# 7) 상태 출력(비밀은 출력하지 않음)
systemctl is-active coturn
ss -lunp | grep ':3478 ' || { echo '3478/udp 리스너 없음'; exit 1; }
ss -ltnp | grep ':3478 ' || { echo '3478/tcp 리스너 없음'; exit 1; }
journalctl -u coturn -n 15 --no-pager | grep -viE 'secret' || true
echo "완료 — Vercel seminar env : TURN_HOST=$IP.sslip.io (호스트만, 스킴·포트 금지) · TURN_SECRET=<이 스크립트에 준 값>"
