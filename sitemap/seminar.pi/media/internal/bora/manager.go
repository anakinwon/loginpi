// Manager — 방 목록·세션→(방, 참가자) 표(고루틴 1개 소유)와 signal.Handler 구현(시그널링 메서드 → 방 명령 분배).
package bora

import (
	"encoding/json"
	"time"

	"github.com/pion/webrtc/v4"

	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

type sessRef struct {
	room *Room
	peer string
}

// Manager — 방 목록.
type Manager struct {
	rooms    map[string]*Room   // loop 고루틴 소유
	sessions map[string]sessRef // 세션 ID → 방·참가자(loop 고루틴 소유)
	cmd      chan func()

	api    *webrtc.API // SetAPI 로 기동 시 1번(이후 읽기만)
	ice    []webrtc.ICEServer
	iceOut []signal.ICEServer
}

// NewManager — 엔진 기동 시 1개. 서비스 전에 SetAPI 를 불러야 한다.
func NewManager() *Manager {
	m := &Manager{rooms: map[string]*Room{}, sessions: map[string]sessRef{}, cmd: make(chan func())}
	go func() {
		for fn := range m.cmd {
			fn()
		}
	}()
	return m
}

// SetAPI — 엔진 API(capri.NewAPI)와 클라이언트에게 알려 줄 ICE 서버. 서비스 시작 전 1번만.
func (m *Manager) SetAPI(api *webrtc.API, ice []signal.ICEServer) {
	m.api, m.iceOut = api, ice
	m.ice = make([]webrtc.ICEServer, 0, len(ice))
	for _, s := range ice {
		m.ice = append(m.ice, webrtc.ICEServer{URLs: s.URLs, Username: s.Username, Credential: s.Credential})
	}
}

// exec — 목록 고루틴에서 실행(완료까지 대기).
func (m *Manager) exec(fn func()) {
	ok := make(chan struct{})
	m.cmd <- func() { fn(); close(ok) }
	<-ok
}

// room — 있으면 돌려주고, 없으면 입장권 기준(cap·end)으로 만든다.
func (m *Manager) room(t signal.Ticket) *Room {
	var r *Room
	m.exec(func() {
		r = m.rooms[t.Room]
		if r == nil {
			var end time.Time
			if t.End > 0 {
				end = time.Unix(t.End, 0)
			}
			r = NewRoom(t.Room, t.Cap, end)
			r.api, r.ice = m.api, m.ice
			m.rooms[t.Room] = r
		}
	})
	return r
}

func (m *Manager) ref(s signal.Session) (sessRef, bool) {
	var ref sessRef
	var ok bool
	m.exec(func() { ref, ok = m.sessions[s.ID()] })
	return ref, ok
}

// Join — signal.Handler. 방을 찾거나 만들고 Room.Join, 응답에 iceServers·기존 producers.
func (m *Manager) Join(s signal.Session, t signal.Ticket) (signal.JoinRes, *signal.Error) {
	r := m.room(t)
	p, e := r.Join(t, s)
	if e != nil {
		return signal.JoinRes{}, e
	}
	var list []signal.ProducerInfo
	r.exec(func() { list = r.producerInfos(p.ID) })
	m.exec(func() { m.sessions[s.ID()] = sessRef{room: r, peer: p.ID} })
	ice := m.iceOut
	if ice == nil {
		ice = []signal.ICEServer{}
	}
	return signal.JoinRes{PeerID: p.ID, Role: t.Role, IceServers: ice, Producers: list}, nil
}

func decode[T any](d json.RawMessage) (T, *signal.Error) {
	var v T
	if err := json.Unmarshal(d, &v); err != nil {
		return v, signal.Errf(signal.CodeSDPInvalid, "요청 데이터 해석 실패") // [TBD : M3 SIGNAL_API — 일반 BAD_REQUEST 코드 여부]
	}
	return v, nil
}

// Request — signal.Handler. 메서드 이름(signal.M*)으로 방 명령에 분배.
func (m *Manager) Request(s signal.Session, method string, d json.RawMessage) (any, *signal.Error) {
	ref, ok := m.ref(s)
	if !ok {
		return nil, signal.Errf(signal.CodeNotFound, "join 전")
	}
	r := ref.room
	switch method {
	case signal.MTransportPublish:
		v, e := decode[signal.SDP](d)
		if e != nil {
			return nil, e
		}
		ans, e := r.publish(ref.peer, v.SDP)
		if e != nil {
			return nil, e
		}
		return signal.SDP{SDP: ans}, nil
	case signal.MProduce:
		v, e := decode[signal.ProduceReq](d)
		if e != nil {
			return nil, e
		}
		var kind santorini.Kind
		switch v.Kind {
		case "video":
			kind = santorini.Video
		case "audio":
			kind = santorini.Audio
		default:
			return nil, signal.Errf(signal.CodeSDPInvalid, "kind 는 audio|video")
		}
		src := santorini.Source(v.Source)
		if src != santorini.Camera && src != santorini.Screen && src != santorini.Mic {
			src = santorini.Camera
		}
		pr, e := r.produce(ref.peer, v.Mid, kind, src)
		if e != nil {
			return nil, e
		}
		return signal.ProduceRes{ProducerID: pr.ID()}, nil
	case signal.MTransportSubscribeAnswer:
		v, e := decode[signal.SDP](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.subAnswer(ref.peer, v.SDP)
	case signal.MTrickle:
		v, e := decode[signal.Trickle](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.trickle(ref.peer, v)
	case signal.MConsumerResume:
		v, e := decode[signal.ConsumerRef](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.ResumeConsumer(ref.peer, v.ConsumerID)
	case signal.MConsumerSetLayer:
		v, e := decode[signal.SetLayer](d)
		if e != nil {
			return nil, e
		}
		c, e := r.consumerOf(ref.peer, v.ConsumerID)
		if e != nil {
			return nil, e
		}
		c.SetMax(v.MaxSpatial)
		return struct{}{}, nil
	case signal.MProducerClose:
		v, e := decode[signal.ProducerRef](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.CloseProducer(ref.peer, v.ProducerID)
	case signal.MProducerPause, signal.MProducerResume:
		v, e := decode[signal.ProducerRef](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.PauseProducer(ref.peer, v.ProducerID, method == signal.MProducerPause)
	}
	return nil, signal.Errf(signal.CodeNotFound, "미구현 메서드: "+method)
}

// Left — signal.Handler. 세션이 속한 방에서 Leave.
func (m *Manager) Left(s signal.Session) {
	ref, ok := m.ref(s)
	if !ok {
		return
	}
	m.exec(func() { delete(m.sessions, s.ID()) })
	ref.room.Leave(ref.peer)
}
