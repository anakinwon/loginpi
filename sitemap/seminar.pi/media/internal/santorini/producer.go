// Producer — 트랙 1개와 그 레이어들. 레이어 목록은 AddLayer 이후 바뀌지 않는다(발행 PC OnTrack 단계에서만 추가).
package santorini

import (
	"sync"
	"sync/atomic"
)

// Kind — 미디어 종류.
type Kind uint8

const (
	Audio Kind = iota
	Video
)

func (k Kind) String() string {
	if k == Video {
		return "video"
	}
	return "audio"
}

// Source — 발행 원천(signal ProduceReq.Source).
type Source string

const (
	Camera Source = "camera"
	Screen Source = "screen"
	Mic    Source = "mic"
)

// MaxLayers — rid l/m/h.
const MaxLayers = 3

// LayerIndex — rid → 레이어 번호. 단일 레이어("")는 0.
func LayerIndex(rid string) int8 {
	switch rid {
	case "m":
		return 1
	case "h":
		return 2
	}
	return 0
}

// Producer — bora(방) 고루틴이 만들고 닫는다. 레이어 추가는 capri OnTrack 고루틴에서 → mu 로 보호.
type Producer struct {
	id       string
	peerID   string
	kind     Kind
	source   Source
	priority atomic.Uint32 // 화면공유 255 > 발표자 영상 > 패널 영상(bwe 가 읽음)
	remb     atomic.Int64  // 발표자에게 보낼 REMB 상한(bps, 0 = 안 보냄) — bora 가 1초마다 정함
	levelID  atomic.Uint32 // 음성 : 협상된 ssrc-audio-level 확장 ID(0 = 없음, level.go)

	mu     sync.RWMutex
	layers [MaxLayers]*Layer

	once sync.Once
	done chan struct{}
}

// New — Producer 생성(레이어는 AddLayer 로).
func New(id, peerID string, kind Kind, src Source) *Producer {
	return &Producer{id: id, peerID: peerID, kind: kind, source: src, done: make(chan struct{})}
}

func (p *Producer) ID() string          { return p.id }
func (p *Producer) PeerID() string      { return p.peerID }
func (p *Producer) Kind() Kind          { return p.kind }
func (p *Producer) Source() Source      { return p.source }
func (p *Producer) Priority() uint8     { return uint8(p.priority.Load()) }
func (p *Producer) SetPriority(v uint8) { p.priority.Store(uint32(v)) }

// SetREMBCap — 발행자 방향 REMB 상한(bps). 레이어 수신 고루틴이 RR 주기에 읽어 보낸다. 어느 고루틴이든 안전.
func (p *Producer) SetREMBCap(bps int64) { p.remb.Store(bps) }

// REMBCap — 현재 REMB 상한(bps).
func (p *Producer) REMBCap() int64        { return p.remb.Load() }
func (p *Producer) Done() <-chan struct{} { return p.done }

// Layer — 레이어 i(0~2). 없으면 nil.
func (p *Producer) Layer(i int8) *Layer {
	if i < 0 || i >= MaxLayers {
		return nil
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.layers[i]
}

// AddLayer — rid 레이어를 만들고 수신 고루틴을 띄운다(r=TrackRemote, up=발행 Transport). 같은 rid 가 다시 오면 기존 것을 돌려준다.
func (p *Producer) AddLayer(rid string, r Reader, up RTCPWriter) *Layer {
	i := LayerIndex(rid)
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.layers[i] != nil {
		return p.layers[i]
	}
	l := newLayer(i, p.kind, p.done)
	l.remb = &p.remb
	l.levelID = &p.levelID
	p.layers[i] = l
	go l.Run(r, up)
	return l
}

// Close — 모든 레이어 수신 고루틴 종료 신호. 연결 Consumer 정리는 bora(lifecycle.go)가 한다.
func (p *Producer) Close() { p.once.Do(func() { close(p.done) }) }
