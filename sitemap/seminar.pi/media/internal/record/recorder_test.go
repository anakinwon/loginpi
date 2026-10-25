// 녹화기 테스트 — IVF·Ogg 헤더 바이트, VP8 프레임 조립(순번 감김·손실 후 키프레임 대기), Ogg CRC·EOS, Opus TOC 표본 수.
package record

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"github.com/pion/rtp"
)

func pkt(seq uint16, ts uint32, marker bool, payload ...byte) *rtp.Packet {
	return &rtp.Packet{Header: rtp.Header{SequenceNumber: seq, Timestamp: ts, Marker: marker}, Payload: payload}
}

// vp8Key — 페이로드 기술자(X=1, I=1 15비트 picture ID) + 키프레임 헤더(640×360).
func vp8Key() []byte {
	return []byte{0x90, 0x80, 0x80, 0x01, 0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0x68, 0x01}
}

func TestIVF(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v.ivf")
	r, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	steps := []*rtp.Packet{
		pkt(65534, 4294967000, false, 0x10, 0x01), // 키프레임 전 델타 프레임 → 버림
		pkt(65535, 4294967000, true, 0x00, 0xAA),
		pkt(0, 100, true, vp8Key()...),        // 65535→0 감김은 손실 아님, ts 감김
		pkt(1, 3100, false, 0x10, 0x01, 0x02), // 델타 프레임 첫 조각
		pkt(2, 3100, true, 0x00, 0x03),        // 끝 조각
		pkt(4, 6100, true, 0x10, 0x01),        // 순번 틈(3 손실) → 키프레임까지 버림
		pkt(5, 9100, true, append([]byte{}, vp8Key()...)...),
	}
	for _, p := range steps {
		if err := r.WriteRTP(p); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.Close(); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(path)
	want := []byte{'D', 'K', 'I', 'F', 0, 0, 32, 0, 'V', 'P', '8', '0', 0x80, 0x02, 0x68, 0x01,
		0x90, 0x5f, 0x01, 0x00, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0}
	if !bytes.Equal(b[:32], want) {
		t.Fatalf("IVF 헤더\n got %x\nwant %x", b[:32], want)
	}
	// 프레임 3개 : 키 · 델타(조각 2개) · 키 — 크기·타임스탬프(ts 감김 보정) 확인
	frames := []struct {
		size int
		ts   uint64
	}{{10, 396}, {3, 3396}, {10, 9396}}
	off := 32
	for i, f := range frames {
		size := int(binary.LittleEndian.Uint32(b[off:]))
		ts := binary.LittleEndian.Uint64(b[off+4:])
		if size != f.size || ts != f.ts {
			t.Fatalf("프레임 %d : size %d ts %d, want %d %d", i, size, ts, f.size, f.ts)
		}
		off += 12 + size
	}
	if off != len(b) {
		t.Fatalf("남는 바이트 %d", len(b)-off)
	}
}

func TestOgg(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.ogg")
	r, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	// CELT 20ms(cfg 31, code 0) 패킷 2개
	r.WriteRTP(pkt(10, 1000, true, 0xf8, 1, 2, 3))
	r.WriteRTP(pkt(11, 1960, true, 0xf8, 4, 5))
	if err := r.Close(); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(path)
	type page struct {
		flags   byte
		granule uint64
		seq     uint32
		body    []byte
	}
	var pages []page
	for off := 0; off < len(b); {
		if string(b[off:off+4]) != "OggS" {
			t.Fatalf("페이지 시작 오류 @%d", off)
		}
		nseg := int(b[off+26])
		n := 0
		for _, l := range b[off+27 : off+27+nseg] {
			n += int(l)
		}
		end := off + 27 + nseg + n
		hdr := append([]byte{}, b[off:off+27+nseg]...)
		gotCRC := binary.LittleEndian.Uint32(hdr[22:])
		copy(hdr[22:26], []byte{0, 0, 0, 0})
		if c := oggCRC(oggCRC(0, hdr), b[off+27+nseg:end]); c != gotCRC {
			t.Fatalf("CRC 불일치 page %d", len(pages))
		}
		pages = append(pages, page{b[off+5], binary.LittleEndian.Uint64(b[off+6:]), binary.LittleEndian.Uint32(b[off+18:]), b[off+27+nseg : end]})
		off = end
	}
	if len(pages) != 4 {
		t.Fatalf("페이지 수 %d", len(pages))
	}
	head := []byte{'O', 'p', 'u', 's', 'H', 'e', 'a', 'd', 1, 2, 0x00, 0x0f, 0x80, 0xbb, 0, 0, 0, 0, 0}
	if pages[0].flags != 0x02 || !bytes.Equal(pages[0].body, head) {
		t.Fatalf("OpusHead %x flags %x", pages[0].body, pages[0].flags)
	}
	if string(pages[1].body[:8]) != "OpusTags" {
		t.Fatal("OpusTags 없음")
	}
	if pages[2].granule != 960 || pages[3].granule != 1920 || pages[3].flags != 0x04 || pages[3].seq != 3 {
		t.Fatalf("오디오 페이지 %+v %+v", pages[2], pages[3])
	}
}

func TestOggCRCVector(t *testing.T) {
	// 다항식 0x04c11db7 비반사·초기 0·XOR 없음 표준 검사값("123456789")
	if c := oggCRC(0, []byte("123456789")); c != 0x89a1897f {
		t.Fatalf("crc %08x", c)
	}
}

func TestOpusSamples(t *testing.T) {
	cases := []struct {
		pkt  []byte
		want int
	}{
		{[]byte{0x08}, 960},        // SILK cfg1 20ms
		{[]byte{0x18}, 2880},       // SILK cfg3 60ms
		{[]byte{0x60}, 480},        // Hybrid cfg12 10ms
		{[]byte{0x80}, 120},        // CELT cfg16 2.5ms
		{[]byte{0xf9}, 1920},       // CELT 20ms ×2(code 1)
		{[]byte{0xfb, 0x03}, 2880}, // code 3, 3프레임
		{[]byte{0xfb}, 960},        // code 3 인데 길이 부족
	}
	for _, c := range cases {
		if got := opusSamples(c.pkt); got != c.want {
			t.Errorf("%x : %d want %d", c.pkt, got, c.want)
		}
	}
}

func TestNewRejects(t *testing.T) {
	dir := t.TempDir()
	if _, err := New(filepath.Join(dir, "x.webm")); err == nil {
		t.Fatal("webm 허용됨")
	}
	t.Setenv("MEDIA_RECORD_DIR", "")
	if _, err := Open("r", "p", true); err != ErrDisabled {
		t.Fatalf("기본 꺼짐 아님: %v", err)
	}
	t.Setenv("MEDIA_RECORD_DIR", dir)
	r, err := Open("../evil", "p/../x", true)
	if err != nil {
		t.Fatal(err)
	}
	r.Close()
	if _, err := os.Stat(filepath.Join(dir, "___evil", "p____x.ivf")); err != nil {
		t.Fatalf("경로 정리 실패: %v", err)
	}
}
