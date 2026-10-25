// VP8 RTP 페이로드(RFC 7741) 해석 — 키프레임 판별. M4 의 picture ID 연속화용 해석은 M4 가 새 파일(rtpx/vp8pid.go)로 추가한다.
package rtpx

// IsVP8Keyframe — 페이로드가 VP8 키프레임의 첫 조각인지. 페이로드 기술자를 건너뛰고 VP8 헤더의 P 비트(0=키프레임)를 본다.
func IsVP8Keyframe(payload []byte) bool {
	if len(payload) < 1 {
		return false
	}
	b0 := payload[0]
	// S(파티션 시작)=1, PID=0 인 첫 조각만 VP8 헤더를 가진다
	if b0&0x10 == 0 || b0&0x07 != 0 {
		return false
	}
	i := 1
	if b0&0x80 != 0 { // X : 확장 바이트가 있다
		if len(payload) < 2 {
			return false
		}
		x := payload[1]
		i = 2
		if x&0x80 != 0 { // I : picture ID, M 비트면 15비트(2바이트)
			if len(payload) <= i {
				return false
			}
			if payload[i]&0x80 != 0 {
				i += 2
			} else {
				i++
			}
		}
		if x&0x40 != 0 { // L : TL0PICIDX
			i++
		}
		if x&0x30 != 0 { // T 또는 K : TID/KEYIDX 1바이트
			i++
		}
	}
	return len(payload) > i && payload[i]&0x01 == 0
}
