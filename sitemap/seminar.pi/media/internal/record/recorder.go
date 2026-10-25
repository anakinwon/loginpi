// Recorder — 내부 Consumer 출력(jeju.Writer)을 파일로 쓴다. M5 에서 구현.
package record

import (
	"errors"

	"github.com/pion/rtp"

	"seminar.pi/media/internal/jeju"
)

var _ jeju.Writer = (*Recorder)(nil)

var errTODO = errors.New("record: M5 에서 구현")

// Recorder — Producer 1개 녹화.
type Recorder struct {
	path string
}

// New — path 에 녹화 파일을 만든다(MEDIA_RECORD_DIR 아래). bora 가 jeju.New(…, out=Recorder) 로 내부 Consumer 를 붙인다.
func New(path string) (*Recorder, error) { return nil, errTODO }

// WriteRTP — jeju.Writer.
func (r *Recorder) WriteRTP(p *rtp.Packet) error { return errTODO }

// Close — 파일 마감.
func (r *Recorder) Close() error { return nil }
