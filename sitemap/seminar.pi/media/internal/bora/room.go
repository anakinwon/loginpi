// Room — 방 1개 = 고루틴 1개. 공개 메서드는 명령 채널로 loop 고루틴에 넘긴다. Join·Produce·Consume 본문은 M1 에서 구현.
package bora

import (
	"sync"
	"time"

	"seminar.pi/media/internal/bwe"
	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// 계약 고정 — 구현이 바뀌어도 이 관계는 깨지면 안 된다.
var (
	_ capri.RTCPSink       = (*jeju.Consumer)(nil)
	_ bwe.Target           = (*jeju.Consumer)(nil)
	_ santorini.RTCPWriter = (*capri.Transport)(nil)
	_ signal.Handler       = (*Manager)(nil)
)

func errTODO(stage string) *signal.Error {
	return signal.Errf(signal.CodeInternal, "bora: "+stage+" 에서 구현")
}

// Peer — 참가자 1명. 필드는 방 고루틴 소유.
type Peer struct {
	ID        string
	Ticket    signal.Ticket
	Session   signal.Session
	Pub       *capri.Transport // presenter·panel 만
	Sub       *capri.Transport
	Alloc     *bwe.Allocator // 구독 PC 당 1개(M4)
	Producers map[string]*santorini.Producer
	Consumers map[string]*jeju.Consumer
}

// Room — 방.
type Room struct {
	id  string
	cap int
	end time.Time // 0 이면 종료 시각 없음

	// loop 고루틴 소유
	peers     map[string]*Peer
	producers map[string]*santorini.Producer
	consumers map[string]map[string]*jeju.Consumer // producerID → consumerID → Consumer

	cmd  chan func()
	once sync.Once
	done chan struct{}
}

// NewRoom — 첫 입장 때 Manager 가 만든다(cap·end 는 입장권 기준으로 고정).
func NewRoom(id string, cap int, end time.Time) *Room {
	r := &Room{
		id: id, cap: cap, end: end,
		peers: map[string]*Peer{}, producers: map[string]*santorini.Producer{},
		consumers: map[string]map[string]*jeju.Consumer{},
		cmd:       make(chan func(), 64), done: make(chan struct{}),
	}
	go r.loop()
	return r
}

func (r *Room) ID() string            { return r.id }
func (r *Room) Done() <-chan struct{} { return r.done }

func (r *Room) loop() {
	for {
		select {
		case fn := <-r.cmd:
			fn()
		case <-r.done:
			return
		}
	}
}

// exec — fn 을 방 고루틴에서 실행하고 끝날 때까지 기다린다. 방이 닫혔으면 false.
func (r *Room) exec(fn func()) bool {
	ok := make(chan struct{})
	select {
	case r.cmd <- func() { fn(); close(ok) }:
	case <-r.done:
		return false
	}
	select {
	case <-ok:
		return true
	case <-r.done:
		return false
	}
}

// Join — 정원·역할·중복 sub(기존 세션 DUPLICATE_SESSION 종료) 검사 후 Peer 생성. M1 에서 구현.
func (r *Room) Join(t signal.Ticket, s signal.Session) (*Peer, *signal.Error) {
	return nil, errTODO("M1")
}

// Leave — 연쇄 정리(lifecycle.go closePeer).
func (r *Room) Leave(peerID string) { r.exec(func() { r.closePeer(peerID) }) }

// Produce — presenter·panel 만(역할 2차 검사). Producer 생성 후 기존 청중 전원 Consume. M1 에서 구현.
func (r *Room) Produce(peerID string, kind santorini.Kind, src santorini.Source) (*santorini.Producer, *signal.Error) {
	return nil, errTODO("M1")
}

// Consume — 구독 PC 에 출력 트랙 추가 + 레이어 Subscribe + ntf consumerCreated. M1 에서 구현.
func (r *Room) Consume(peerID, producerID string, paused bool) (*jeju.Consumer, *signal.Error) {
	return nil, errTODO("M1")
}

// SetPriority — 화면공유 255 > 발표자 영상 > 패널 영상.
func (r *Room) SetPriority(producerID string, p uint8) {
	r.exec(func() {
		if pr := r.producers[producerID]; pr != nil {
			pr.SetPriority(p)
		}
	})
}

// Close — 방 종료(모든 참가자 연쇄 정리 후 고루틴 종료).
func (r *Room) Close() {
	r.exec(func() {
		for id := range r.peers {
			r.closePeer(id)
		}
	})
	r.once.Do(func() { close(r.done) })
}
