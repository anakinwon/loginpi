#!/usr/bin/env bash
# Galápagos 엔진 VPS 설치 — Vultr 서울(Ubuntu 24.04)에서 root 로 1회 실행. 다시 돌려도 안전(덮어쓰기는 엔진·서비스·Caddy 설정만).
# 사용 : PC 에서 `scp galapagos vps-setup.sh root@<IP>:/root/` → VPS 에서 `bash /root/vps-setup.sh`
# 결과 : wss://<IP>.sslip.io/signal (Caddy 자동 TLS) · UDP 7882 영상 · systemd 자동 재시작. 정본 절차 media/docs/VPS_GUIDE.md
set -euo pipefail

UDP_PORT=7882
ORIGINS='https://seminarz.vercel.app,https://seminar0532.pinet.com'
BIN_SRC=/root/galapagos
ENV_FILE=/etc/galapagos.env

[ "$(id -u)" -eq 0 ] || { echo 'root 로 실행하세요'; exit 1; }
[ -f "$BIN_SRC" ] || { echo "$BIN_SRC 없음 — PC 에서 scp 로 먼저 올리세요"; exit 1; }

# 1) 공인 IPv4 — Vultr 메타데이터, 실패하면 외부 조회
IP=$(curl -fs --max-time 3 http://169.254.169.254/v1/interfaces/0/ipv4/address || curl -4fs --max-time 5 https://ifconfig.me || true)
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "공인 IP 확인 실패: '$IP'"; exit 1; }
HOST="$IP.sslip.io"
echo "공인 IP $IP → $HOST"

# 2) 스왑 1GB — 512MB 요금제에서 apt·Caddy 설치 때 메모리 부족 방지
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 3) Caddy — 배포판 패키지 우선, 없으면 공식 저장소
apt-get update -y
if ! apt-get install -y caddy; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# 4) 엔진 — 전용 저권한 사용자
id galapagos >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin galapagos
install -d -o galapagos -g galapagos /opt/galapagos
install -m 755 "$BIN_SRC" /opt/galapagos/galapagos
sha256sum /opt/galapagos/galapagos

# 5) 환경변수 — 비밀값은 화면에 안 보이게 입력(명령행 인자로 받지 않음 = 셸 기록에 안 남음). 이미 있으면 유지
if [ ! -f "$ENV_FILE" ]; then
  read -rsp 'MEDIA_TOKEN_SECRET (Vercel 과 같은 값, 32자 이상): ' TOKEN; echo
  read -rsp 'MEDIA_ADMIN_SECRET (Vercel 과 같은 값, 빈칸 = 관리 API 끔): ' ADMIN; echo
  [ ${#TOKEN} -ge 32 ] || { echo 'MEDIA_TOKEN_SECRET 32자 미만'; exit 1; }
  umask 077
  cat > "$ENV_FILE" <<EOF
MEDIA_ENV=production
MEDIA_LISTEN=127.0.0.1:7880
MEDIA_UDP_PORT=$UDP_PORT
MEDIA_PUBLIC_IP=$IP
MEDIA_ALLOWED_ORIGINS=$ORIGINS
MEDIA_TOKEN_SECRET=$TOKEN
MEDIA_ADMIN_SECRET=$ADMIN
EOF
else
  sed -i "s/^MEDIA_PUBLIC_IP=.*/MEDIA_PUBLIC_IP=$IP/" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

cat > /etc/systemd/system/galapagos.service <<'EOF'
[Unit]
Description=Galapagos SFU (seminar.pi)
After=network-online.target
Wants=network-online.target

[Service]
User=galapagos
EnvironmentFile=/etc/galapagos.env
ExecStart=/opt/galapagos/galapagos
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# 6) Caddy — 443 TLS 종단 → 엔진(로컬만 대기)
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
	reverse_proxy 127.0.0.1:7880
}
EOF

# 7) 방화벽 — SSH·HTTP(인증서 발급)·HTTPS·영상 UDP 만
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow "$UDP_PORT"/udp
ufw --force enable

systemctl daemon-reload
systemctl enable --now galapagos
systemctl restart galapagos caddy

sleep 3
systemctl --no-pager --lines=3 status galapagos || true
echo
echo "healthz : $(curl -fs --max-time 15 "https://$HOST/healthz" || echo '실패 — 인증서 발급 중일 수 있음, 1분 뒤 다시 확인')"
echo "Vercel NEXT_PUBLIC_MEDIA_WS_URL = wss://$HOST/signal"
