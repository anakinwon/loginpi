// 하류 재전송 — 청중 NACK → SendMeta.Resolve(억제·3회·PLI 후 중단) → cache.Get → 같은 SSRC 재전송(D-5), 캐시 미스는 50ms 모아 상류 NACK(PRD_02 4.2).
// D-5 : RTX 없이 같은 SSRC·같은 순번으로 다시 보낸다. 늦은 재전송의 수락 여부는 청중 쪽 SRTP 재전송 보호 창이 정한다
// (Chrome 1024 · pion 기본 64 — 서버 capri 512 는 엔진 수신 방향만, docs/M2_TURN_NETEM.md 2절·5절 실측 2026-10-26).
package jeju

import (
	"time"

	"github.com/pion/rtcp"
	"github.com/pion/rtp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/metrics"
	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/rtcpx"
	"seminar.pi/media/internal/santorini"
)

// onNACK — 송신 고루틴 전용(OnRTCP 가 cmd 채널로 넘김).
func (c *Consumer) onNACK(n *rtcp.TransportLayerNack) {
	if n.MediaSSRC != c.outSSRC {
		return
	}
	now := time.Now()
	buf := make([]byte, nack.SlotSize)
	for _, seq := range rtcpx.NACKSeqs(n.Nacks) {
		metrics.Global.NACKIn.Add(1)
		src, layer, ok := c.meta.Resolve(seq, now, c.meta.RTT())
		if !ok {
			metrics.Global.DuplicateNACK.Add(1) // 억제·3회 초과·PLI 후 중단·추정 불가
			continue
		}
		l := c.producer.Layer(layer)
		if l == nil {
			continue
		}
		k := l.Cache().Get(src, buf)
		if k == 0 {
			metrics.Global.CacheMiss.Add(1)
			c.meta.AddMiss(src, layer, now)
			continue
		}
		if c.writeOut(buf[:k], seq) == nil {
			metrics.Global.Retransmits.Add(1)
			c.statRtx++
		}
	}
	c.flushMisses(now)
}

// recordSent — 보낸 패킷 기록(Run·replay 가 WriteRTP 성공 후 호출). 키프레임이 나가면 재전송 재개, 미스 묶음 만기 확인.
func (c *Consumer) recordSent(out uint16, it forward.Item, now time.Time) {
	c.meta.Push(out, it.ExtSeq, it.Layer, now)
	if it.Key {
		c.meta.KeyframeSent()
	}
	c.flushMisses(now)
}

// stopRTX — 청중 PLI·FIR 수신 시(rtcp.go requestKeyframe 경로) 키프레임이 나갈 때까지 재전송 중단(REA_03 5.3).
func (c *Consumer) stopRTX() { c.meta.StopRTX() }

// flushMisses — 50ms 묶음이 만기되면 레이어별로 상류 재요청(santorini.Layer.RequestNACK). 송신 고루틴 전용.
// 만기 확인은 송신·NACK 처리 때마다 한다 — 흐름이 멈추면 밀리지만 그때는 상류도 멈춘 것이다.
func (c *Consumer) flushMisses(now time.Time) {
	ms := c.meta.TakeMisses(now)
	if ms == nil {
		return
	}
	var by [santorini.MaxLayers][]uint64
	for _, m := range ms {
		if m.Layer >= 0 && int(m.Layer) < len(by) {
			by[m.Layer] = append(by[m.Layer], m.Src)
		}
	}
	for i, exts := range by {
		if len(exts) == 0 {
			continue
		}
		if l := c.producer.Layer(int8(i)); l != nil {
			l.RequestNACK(exts)
		}
	}
}

// writeOut — 재전송 : 캐시 본문을 출력 헤더로 바꿔 보낸다(같은 SSRC·같은 출력 순번, D-5).
func (c *Consumer) writeOut(raw []byte, out uint16) error {
	_, _, err := c.write(raw, out)
	return err
}

// write — 고정 OutSSRC·출력 순번·ts−tsOffset·헤더 확장 교체(들어온 것 제거 + abs-send-time, D-12)·VP8 picture ID 연속화(M4). 출력 TS·페이로드 크기를 돌려준다.
// raw 는 호출자 버퍼(캐시 사본)라 제자리 수정해도 된다. 재전송은 현재 구간(SendMeta.Fence 이후)만 오므로 tsOffset·picture ID 오프셋이 처음 보낼 때와 같다.
func (c *Consumer) write(raw []byte, out uint16) (uint32, int, error) {
	var p rtp.Packet
	if err := p.Unmarshal(raw); err != nil {
		return 0, 0, err
	}
	p.SSRC = c.outSSRC
	p.SequenceNumber = out
	p.Timestamp -= c.tsOffset
	p.Extension, p.Extensions = false, nil
	if c.absID != 0 {
		if b, err := rtp.NewAbsSendTimeExtension(time.Now()).Marshal(); err == nil {
			_ = p.SetExtension(c.absID, b)
		}
	}
	c.rewriteVP8(p.Payload)
	return p.Timestamp, len(p.Payload), c.out.WriteRTP(&p)
}
