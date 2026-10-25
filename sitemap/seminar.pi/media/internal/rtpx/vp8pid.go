// VP8 picture ID·TL0PICIDX 연속화(RFC 7741 페이로드 기술자) — simulcast 레이어 전환 뒤에도 구독자 디코더가 보는 값이 끊기지 않게 한다(PRD_02 4.1 9단계, REA_02 5.7).
// 사용 : jeju 송신 고루틴이 Forward 패킷 페이로드마다 Rewrite, 레이어 전환 시 Sync. 소유 고루틴 1개 전용(잠금 없음).
package rtpx

// vp8Fields — 페이로드 안 picture ID·TL0PICIDX 위치. 없으면 -1.
type vp8Fields struct {
	pid   int  // picture ID 첫 바이트 위치
	pid15 bool // 15비트(M=1) 여부
	tl0   int  // TL0PICIDX 위치
}

// parseVP8Fields — 기술자만 본다. 잘린 페이로드면 ok=false.
func parseVP8Fields(p []byte) (f vp8Fields, ok bool) {
	f = vp8Fields{pid: -1, tl0: -1}
	if len(p) < 1 {
		return f, false
	}
	if p[0]&0x80 == 0 { // X 없음 : 확장 필드 없음
		return f, true
	}
	if len(p) < 2 {
		return f, false
	}
	x, i := p[1], 2
	if x&0x80 != 0 { // I
		if len(p) <= i {
			return f, false
		}
		f.pid = i
		if p[i]&0x80 != 0 {
			if len(p) <= i+1 {
				return f, false
			}
			f.pid15 = true
			i += 2
		} else {
			i++
		}
	}
	if x&0x40 != 0 { // L
		if len(p) <= i {
			return f, false
		}
		f.tl0 = i
	}
	return f, true
}

// VP8PictureID — 페이로드의 picture ID(15비트 공간). 없으면 ok=false.
func VP8PictureID(p []byte) (pid uint16, ok bool) {
	f, ok := parseVP8Fields(p)
	if !ok || f.pid < 0 {
		return 0, false
	}
	if f.pid15 {
		return uint16(p[f.pid]&0x7F)<<8 | uint16(p[f.pid+1]), true
	}
	return uint16(p[f.pid] & 0x7F), true
}

// VP8Munger — 출력 picture ID = 입력 + 오프셋(15비트), TL0PICIDX 도 같은 방식(8비트). 0값 그대로 쓴다.
type VP8Munger struct {
	started, resync bool
	pidOff          uint16
	tl0Off          uint8
	lastPID         uint16 // 마지막(가장 새) 출력 picture ID
	lastTL0         uint8
}

// Sync — 다음 Rewrite 에서 새 레이어의 picture ID 가 직전 출력 + 1 로 이어지게 재기준(레이어 전환 시).
func (m *VP8Munger) Sync() { m.resync = true }

// Rewrite — 페이로드를 제자리에서 고친다. 기술자에 picture ID 가 없거나 잘렸으면 false(그대로 둠).
func (m *VP8Munger) Rewrite(p []byte) bool {
	f, ok := parseVP8Fields(p)
	if !ok || f.pid < 0 {
		return false
	}
	pid, _ := VP8PictureID(p)
	var tl0 uint8
	if f.tl0 >= 0 {
		tl0 = p[f.tl0]
	}
	switch {
	case !m.started:
		m.started = true
		m.lastPID, m.lastTL0 = pid, tl0
	case m.resync:
		m.pidOff = (m.lastPID + 1 - pid) & 0x7FFF
		m.tl0Off = m.lastTL0 + 1 - tl0
	}
	m.resync = false
	out := (pid + m.pidOff) & 0x7FFF
	if f.pid15 {
		p[f.pid] = 0x80 | byte(out>>8)
		p[f.pid+1] = byte(out)
	} else {
		p[f.pid] = byte(out & 0x7F) // 7비트 필드 : 하위 7비트만 담긴다
	}
	if int16((out-m.lastPID)<<1) > 0 { // 15비트 직렬 비교 : 더 새 값만 기준으로
		m.lastPID = out
	}
	if f.tl0 >= 0 {
		t := tl0 + m.tl0Off
		p[f.tl0] = t
		if int8(t-m.lastTL0) > 0 {
			m.lastTL0 = t
		}
	}
	return true
}
