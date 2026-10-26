// RTP 오디오 레벨 헤더 확장(RFC 6464 "client-to-mixer") 해석 — 확장 원소 데이터 첫 바이트 = V(1비트 음성 여부) | level(7비트, 0~127 = -dBov).
// 확장 블록에서 원소를 꺼내는 일은 pion rtp 직렬화(S-1 허용 범위)가 하고, 여기서는 원소 바이트만 읽는다. 담당 : 후속 G(SIGNAL_API 3.5).
package rtpx

// AudioLevelURI — SDP extmap 이름(RFC 6464 4절).
const AudioLevelURI = "urn:ietf:params:rtp-hdrext:ssrc-audio-level"

// AudioLevelSilent — 가장 작은 소리(-127 dBov). 레벨 값은 작을수록 크다.
const AudioLevelSilent = 127

// AudioLevel — 확장 원소 데이터 → (레벨 0~127, 음성 표시 V, 해석 성공). 1바이트·2바이트 헤더 형식 모두 첫 바이트가 값이다
// (2바이트 형식은 뒤에 0 채움이 붙을 수 있음, RFC 6464 3절). 빈 데이터면 ok=false.
func AudioLevel(b []byte) (level uint8, voice, ok bool) {
	if len(b) == 0 {
		return 0, false, false
	}
	return b[0] & 0x7f, b[0]&0x80 != 0, true
}
