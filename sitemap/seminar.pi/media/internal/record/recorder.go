// Recorder — 내부 Consumer 출력(jeju.Writer)을 파일로 쓴다. 확장자로 형식 결정 : .ivf = VP8(IVF), .ogg = Opus(Ogg, RFC 7845).
// 외부 프로세스·외부 라이브러리 없이 표준 라이브러리로 직접 작성(PRD_02 3.3 record, REA_01 5.12 "녹화기 = 구독 클라이언트").
package record

import (
	"bufio"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/pion/rtp"

	"seminar.pi/media/internal/jeju"
)

var _ jeju.Writer = (*Recorder)(nil)

// ErrDisabled — MEDIA_RECORD_DIR 미설정(기본 = 녹화 끔).
var ErrDisabled = errors.New("record: MEDIA_RECORD_DIR 미설정 — 녹화 꺼짐")

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9_-]`)

// Open — MEDIA_RECORD_DIR/<room>/<producerID>.(ivf|ogg) 녹화기를 만든다. 미설정이면 ErrDisabled.
// bora 가 Producer 생성 직후 jeju.New(…, out=Recorder) 로 내부 Consumer 를 붙일 때 쓴다(최고 레이어 고정·할당기 제외).
func Open(room, producerID string, video bool) (*Recorder, error) {
	dir := os.Getenv("MEDIA_RECORD_DIR")
	if dir == "" {
		return nil, ErrDisabled
	}
	ext := ".ogg"
	if video {
		ext = ".ivf"
	}
	// 경로 이탈 방지 — 방·producer ID 는 외부(입장권·클라이언트)에서 오므로 안전 문자만 남긴다
	d := filepath.Join(dir, unsafeName.ReplaceAllString(room, "_"))
	if err := os.MkdirAll(d, 0o750); err != nil {
		return nil, err
	}
	return New(filepath.Join(d, unsafeName.ReplaceAllString(producerID, "_")+ext))
}

// Recorder — Producer 1개 녹화. WriteRTP(jeju 송신 고루틴)와 Close(bora)가 다른 고루틴이라 잠금으로 보호.
type Recorder struct {
	mu   sync.Mutex
	f    *os.File
	w    *bufio.Writer
	ivf  bool
	err  error // 첫 쓰기 오류 이후 모든 쓰기 중단
	done bool

	// RTP 공통
	started  bool
	lastSeq  uint16
	firstTS  uint32
	lastTS   uint32
	extTS    int64 // firstTS 기준 누적 타임스탬프(32비트 감김 보정)
	frameBuf []byte

	// IVF
	needKey bool
	frames  uint32
	width   uint16
	height  uint16

	// Ogg
	pageSeq uint32
	pending []byte // EOS 표시를 위해 마지막 패킷 1개를 들고 있는다
	pendGP  int64
}

// New — path 에 녹화 파일을 만든다. 확장자 .ivf(VP8) 또는 .ogg(Opus).
func New(path string) (*Recorder, error) {
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".ivf" && ext != ".ogg" {
		return nil, errors.New("record: 확장자는 .ivf 또는 .ogg")
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		return nil, err
	}
	r := &Recorder{f: f, w: bufio.NewWriterSize(f, 64<<10), ivf: ext == ".ivf", needKey: true}
	if r.ivf {
		_, err = r.w.Write(ivfHeader(0, 0, 0))
	} else {
		err = r.oggHeaders()
	}
	if err != nil {
		f.Close()
		return nil, err
	}
	return r, nil
}

// WriteRTP — jeju.Writer. 쓰기 오류는 그대로 돌려주고 이후 패킷은 버린다.
func (r *Recorder) WriteRTP(p *rtp.Packet) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.err != nil || r.done {
		return r.err
	}
	gap := r.started && p.SequenceNumber != r.lastSeq+1
	if !r.started {
		r.started, r.firstTS, r.lastTS = true, p.Timestamp, p.Timestamp
	}
	r.lastSeq = p.SequenceNumber
	r.extTS += int64(int32(p.Timestamp - r.lastTS)) // 순번이 연속인 출력 스트림이라 차이는 작다
	r.lastTS = p.Timestamp
	if r.ivf {
		r.err = r.vp8(p, gap)
	} else {
		r.err = r.opus(p.Payload, r.extTS)
	}
	return r.err
}

// Close — 파일 마감. IVF 는 프레임 수·해상도를 헤더에 고쳐 쓰고, Ogg 는 마지막 페이지에 EOS 를 단다.
func (r *Recorder) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.done {
		return nil
	}
	r.done = true
	err := r.err
	if err == nil && !r.ivf && r.pending != nil {
		err = r.oggPage(r.pending, r.pendGP, 0x04)
	}
	if e := r.w.Flush(); err == nil {
		err = e
	}
	if err == nil && r.ivf {
		_, err = r.f.WriteAt(ivfHeader(r.width, r.height, r.frames), 0)
	}
	if e := r.f.Close(); err == nil {
		err = e
	}
	return err
}

// ---------- VP8 → IVF ----------

// vp8 — RFC 7741 페이로드 기술자를 벗기고 마커 비트까지 모아 프레임 1개로 쓴다.
// 손실(순번 틈)이 생기면 그 프레임을 버리고 다음 키프레임까지 기다린다(깨진 화면 대신 멈춘 화면).
func (r *Recorder) vp8(p *rtp.Packet, gap bool) error {
	b := p.Payload
	if len(b) < 1 {
		return nil
	}
	if gap {
		r.frameBuf, r.needKey = r.frameBuf[:0], true
	}
	i := 1
	if b[0]&0x80 != 0 { // X
		if len(b) < 2 {
			return nil
		}
		x := b[1]
		i = 2
		if x&0x80 != 0 { // I : picture ID 7 또는 15비트
			if len(b) <= i {
				return nil
			}
			if b[i]&0x80 != 0 {
				i++
			}
			i++
		}
		if x&0x40 != 0 { // L : TL0PICIDX
			i++
		}
		if x&0x30 != 0 { // T 또는 K : TID/KEYIDX 1바이트
			i++
		}
	}
	if len(b) < i {
		return nil
	}
	start := b[0]&0x10 != 0 && b[0]&0x07 == 0
	if start {
		r.frameBuf = r.frameBuf[:0]
	} else if len(r.frameBuf) == 0 {
		return nil // 프레임 중간부터 받은 조각
	}
	r.frameBuf = append(r.frameBuf, b[i:]...)
	if !p.Marker {
		return nil
	}
	frame := r.frameBuf
	r.frameBuf = r.frameBuf[:0]
	if len(frame) == 0 {
		return nil
	}
	if frame[0]&0x01 == 0 { // P 비트 0 = 키프레임 — 시작 코드 뒤 14비트 폭·높이
		r.needKey = false
		if len(frame) >= 10 && frame[3] == 0x9d && frame[4] == 0x01 && frame[5] == 0x2a {
			r.width = binary.LittleEndian.Uint16(frame[6:]) & 0x3fff
			r.height = binary.LittleEndian.Uint16(frame[8:]) & 0x3fff
		}
	} else if r.needKey {
		return nil
	}
	var h [12]byte
	binary.LittleEndian.PutUint32(h[0:], uint32(len(frame)))
	binary.LittleEndian.PutUint64(h[4:], uint64(r.extTS)) // 시간 단위 1/90000(헤더와 같음)
	if _, err := r.w.Write(h[:]); err != nil {
		return err
	}
	_, err := r.w.Write(frame)
	r.frames++
	return err
}

// ivfHeader — IVF 파일 헤더 32바이트(리틀 엔디언). 시간 단위 1/90000 = RTP 영상 클럭.
func ivfHeader(w, h uint16, frames uint32) []byte {
	b := make([]byte, 32)
	copy(b, "DKIF")
	binary.LittleEndian.PutUint16(b[4:], 0)  // version
	binary.LittleEndian.PutUint16(b[6:], 32) // header size
	copy(b[8:], "VP80")
	binary.LittleEndian.PutUint16(b[12:], w)
	binary.LittleEndian.PutUint16(b[14:], h)
	binary.LittleEndian.PutUint32(b[16:], 90000) // timebase denominator
	binary.LittleEndian.PutUint32(b[20:], 1)     // timebase numerator
	binary.LittleEndian.PutUint32(b[24:], frames)
	return b
}

// ---------- Opus → Ogg (RFC 7845) ----------

const (
	oggSerial = 0x5345_4d49 // "SEMI" — 스트림 1개라 고정값
	preSkip   = 3840        // 80ms(48kHz) — RFC 7845 권장 기본 [TBD : 실기기 녹화본 앞부분 확인]
	channels  = 2           // WebRTC opus/48000/2 — 모노 패킷도 디코더가 스테레오로 출력 [TBD]
)

func (r *Recorder) oggHeaders() error {
	head := make([]byte, 19)
	copy(head, "OpusHead")
	head[8] = 1 // version
	head[9] = channels
	binary.LittleEndian.PutUint16(head[10:], preSkip)
	binary.LittleEndian.PutUint32(head[12:], 48000) // 원래 표본율(정보용)
	// [16:18] 출력 이득 0, [18] 채널 매핑 0
	if err := r.oggPage(head, 0, 0x02); err != nil { // BOS
		return err
	}
	vendor := "galapagos"
	tags := make([]byte, 8+4+len(vendor)+4)
	copy(tags, "OpusTags")
	binary.LittleEndian.PutUint32(tags[8:], uint32(len(vendor)))
	copy(tags[12:], vendor)
	return r.oggPage(tags, 0, 0)
}

// opus — 패킷 1개를 페이지 1개로. 그래뉼 = 그 패킷 끝 표본 위치(48kHz, RTP 클럭과 같음).
// ponytail: 패킷당 페이지 1개라 20ms 마다 28바이트 남짓 덧붙는다 — 크기가 문제면 페이지에 여러 패킷 묶기.
func (r *Recorder) opus(pkt []byte, ts int64) error {
	if len(pkt) == 0 || len(pkt) > 255*254 {
		return nil
	}
	if r.pending != nil {
		if err := r.oggPage(r.pending, r.pendGP, 0); err != nil {
			return err
		}
	}
	r.pending = append(r.pending[:0], pkt...)
	r.pendGP = ts + int64(opusSamples(pkt))
	return nil
}

// opusSamples — TOC 바이트로 패킷 표본 수(48kHz) 계산(RFC 6716 3.1). 알 수 없으면 960(20ms).
func opusSamples(pkt []byte) int {
	toc := pkt[0]
	cfg := toc >> 3
	var per int // 2.5ms 단위 ×120 = 표본
	switch {
	case cfg < 12: // SILK 10·20·40·60ms
		per = []int{480, 960, 1920, 2880}[cfg%4]
	case cfg < 16: // Hybrid 10·20ms
		per = []int{480, 960}[cfg%2]
	default: // CELT 2.5·5·10·20ms
		per = []int{120, 240, 480, 960}[cfg%4]
	}
	n := 1
	switch toc & 0x03 {
	case 1, 2:
		n = 2
	case 3:
		if len(pkt) < 2 {
			return 960
		}
		n = int(pkt[1] & 0x3f)
	}
	return per * n
}

// oggPage — 패킷 1개를 담은 Ogg 페이지 1개(RFC 3533). flags : 0x02 BOS, 0x04 EOS.
func (r *Recorder) oggPage(pkt []byte, granule int64, flags byte) error {
	nseg := len(pkt)/255 + 1 // 마지막 lacing 값은 255 미만(0 포함)이어야 패킷이 끝난다
	h := make([]byte, 27+nseg)
	copy(h, "OggS")
	h[5] = flags
	binary.LittleEndian.PutUint64(h[6:], uint64(granule))
	binary.LittleEndian.PutUint32(h[14:], oggSerial)
	binary.LittleEndian.PutUint32(h[18:], r.pageSeq)
	h[26] = byte(nseg)
	for i := 0; i < nseg-1; i++ {
		h[27+i] = 255
	}
	h[27+nseg-1] = byte(len(pkt) % 255)
	crc := oggCRC(oggCRC(0, h), pkt) // CRC 칸(22~25)은 0 인 채로 계산
	binary.LittleEndian.PutUint32(h[22:], crc)
	r.pageSeq++
	if _, err := r.w.Write(h); err != nil {
		return err
	}
	_, err := r.w.Write(pkt)
	return err
}

// Ogg CRC — 다항식 0x04c11db7, 비반사·초기값 0·최종 XOR 없음(hash/crc32 는 반사형이라 직접).
var crcTable = func() (t [256]uint32) {
	for i := range t {
		c := uint32(i) << 24
		for range 8 {
			if c&0x8000_0000 != 0 {
				c = c<<1 ^ 0x04c11db7
			} else {
				c <<= 1
			}
		}
		t[i] = c
	}
	return
}()

func oggCRC(crc uint32, b []byte) uint32 {
	for _, v := range b {
		crc = crc<<8 ^ crcTable[byte(crc>>24)^v]
	}
	return crc
}
