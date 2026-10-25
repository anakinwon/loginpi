#!/usr/bin/env bash
# Galápagos M2 손실·지연 시험 환경 — Linux VM 의 tc netem/tbf 로 PRD_02 7.2 시나리오(T2·T3·T6·T7·T4)를 건다. 초안, 실측 대기.
# 사용 : sudo ./netem.sh <장치> <t2|t3|t4|t6|t7|clear|show> [대상 IP]
#   대상 IP 를 주면 그 청중(또는 발표자)으로 가는 패킷에만 건다(prio + u32 필터), 없으면 장치 전체 송신에 건다.
#   tc 는 송신(egress)에만 걸린다 → 하류(서버→청중)는 서버 VM 에서, 상류(발표자→서버, T7)는 발표자 쪽 장치나 중간 라우터에서 건다.
set -euo pipefail

DEV="${1:-}"
SCEN="${2:-}"
TARGET="${3:-}"

if [[ -z "$DEV" || -z "$SCEN" ]]; then
  echo "사용 : sudo $0 <장치> <t2|t3|t4|t6|t7|clear|show> [대상 IP]" >&2
  exit 2
fi
if ! command -v tc >/dev/null 2>&1; then
  echo "tc(iproute2) 가 없다 — apt install iproute2" >&2
  exit 1
fi

# 시나리오 → netem 인자(PRD_02 7.2). T3 버스트 5초는 apply 후 sleep 5 → clear 로 만든다.
case "$SCEN" in
  t2) NETEM="loss 3%" ;;                      # 균일 손실 3%
  t3) NETEM="loss 10% 25%" ;;                 # 버스트 손실 10%(상관 25%) — 5초만
  t6) NETEM="delay 150ms 30ms distribution normal" ;; # 150ms ± 30ms
  t7) NETEM="loss 3%" ;;                      # 상류 손실 3%(발표자 쪽에서)
  t4) NETEM="" ;;                             # 대역 2Mbps → 400kbps 는 tbf
  clear)
    tc qdisc del dev "$DEV" root 2>/dev/null || true
    echo "해제 : $DEV"
    exit 0 ;;
  show)
    tc qdisc show dev "$DEV"
    tc filter show dev "$DEV" 2>/dev/null || true
    exit 0 ;;
  *) echo "모르는 시나리오 : $SCEN" >&2; exit 2 ;;
esac

tc qdisc del dev "$DEV" root 2>/dev/null || true

if [[ "$SCEN" == "t4" ]]; then
  RATE="${RATE:-400kbit}" # 시작은 RATE=2mbit 로 걸고, 시험 중 기본값(400kbit)으로 다시 실행
  LEAF="tbf rate $RATE burst 32kbit latency 400ms"
else
  LEAF="netem $NETEM"
fi

if [[ -n "$TARGET" ]]; then
  # 대상 IP 로 가는 것만 band 3 에 걸고 나머지는 그대로
  tc qdisc add dev "$DEV" root handle 1: prio
  tc qdisc add dev "$DEV" parent 1:3 handle 30: $LEAF
  tc filter add dev "$DEV" protocol ip parent 1:0 prio 3 u32 match ip dst "$TARGET"/32 flowid 1:3
else
  tc qdisc add dev "$DEV" root $LEAF
fi
echo "적용 : $DEV $SCEN ${TARGET:-전체} ($LEAF)"

if [[ "$SCEN" == "t3" ]]; then
  sleep 5
  tc qdisc del dev "$DEV" root 2>/dev/null || true
  echo "T3 버스트 5초 종료 — 해제"
fi
