// 시그널링 v1.1 방 동작(SIGNAL_API 3.3) — 참가자 목록·입퇴장 묶음 알림, 채팅·손들기·반응(서버 합산), 역할 전환(무대 초대·내리기).
// 권한은 전부 세션 역할(Peer.Role)로 방 고루틴에서 검사한다. room.end 는 Manager(종료 표시·방 정리)가 맡는다.
package bora

import (
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"seminar.pi/media/internal/signal"
)

// PeerBatch — ntf peerJoined·peerLeft 묶음 창(SIGNAL_API 3.3 A).
const PeerBatch = 200 * time.Millisecond

// ReactionWindow — 반응 합산 창(SIGNAL_API 3.3 C).
const ReactionWindow = 300 * time.Millisecond

// ratePerSec — chat.send·reaction.send 피어당 초당 한도. [TBD : M5 실측]
const ratePerSec = 2

// rateLimit — 최근 ratePerSec 건의 시각(오래된 것부터). 1초 슬라이딩 창.
type rateLimit [ratePerSec]time.Time

// allow — 1초 안에 이미 ratePerSec 건이면 false(기록하지 않음).
func (q *rateLimit) allow(now time.Time) bool {
	if now.Sub(q[0]) < time.Second {
		return false
	}
	copy(q[:], q[1:])
	q[ratePerSec-1] = now
	return true
}

func nowMs() int64 { return time.Now().UnixMilli() }

// peerInfos — join 응답 peers(본인 포함, peerId 순). 받는 사람이 audience 면 본인 외 raisedTs 는 0.
func (r *Room) peerInfos(viewer *Peer) []signal.PeerInfo {
	out := make([]signal.PeerInfo, 0, len(r.peers))
	for _, q := range r.peers {
		info := signal.PeerInfo{PeerID: q.ID, Name: q.Ticket.Name, Role: q.Role, RaisedTs: q.raisedTs}
		if viewer.Role == signal.RoleAudience && q != viewer {
			info.RaisedTs = 0
		}
		out = append(out, info)
	}
	slices.SortFunc(out, func(a, b signal.PeerInfo) int { return strings.Compare(a.PeerID, b.PeerID) })
	return out
}

// ── 입퇴장 묶음(방 고루틴 전용) ──

func (r *Room) queueJoined(p *Peer) {
	r.joined = append(r.joined, signal.PeerInfo{PeerID: p.ID, Name: p.Ticket.Name, Role: p.Role})
	r.schedulePeerBatch()
}

func (r *Room) queueLeft(id string) {
	r.left = append(r.left, id)
	r.schedulePeerBatch()
}

func (r *Room) schedulePeerBatch() {
	if r.peerTimer != nil {
		return
	}
	r.peerTimer = time.AfterFunc(PeerBatch, func() { r.do(r.flushPeers) })
}

// flushPeers — 창 안의 입장을 먼저, 퇴장을 나중에. 받는 사람마다 자기보다 뒤에 들어온 사람만 보낸다
// (앞서 들어온 사람은 자기 join 응답 peers 에 이미 있다). 창 안에 들어왔다 나간 사람은 입장·퇴장 둘 다 간다.
func (r *Room) flushPeers() {
	r.peerTimer = nil
	joined, left := r.joined, r.left
	r.joined, r.left = nil, nil
	if len(joined) > 0 {
		for i, info := range joined {
			if q := r.peers[info.PeerID]; q != nil {
				joined[i].Role = q.Role // 창 안에서 역할이 바뀌었으면 지금 값
			}
		}
		for _, p := range r.peers {
			from := slices.IndexFunc(joined, func(x signal.PeerInfo) bool { return x.PeerID == p.ID }) + 1 // 창 밖 참가자면 0 = 전부
			if from < len(joined) && p.Session != nil {
				p.Session.Send(signal.Notification{M: signal.NPeerJoined, D: signal.PeerJoined{Peers: joined[from:]}})
			}
		}
	}
	if len(left) > 0 {
		r.notify("", signal.NPeerLeft, signal.PeerLeft{PeerIDs: left})
	}
}

// ── 채팅·손들기·반응 ──

// Chat — chat.send. 앞뒤 공백 제거 후 1~500자, 피어당 초당 2건. 보낸 사람 외 전원에게 ntf chat.
func (r *Room) Chat(peerID, text string) (int64, *signal.Error) {
	text = strings.TrimSpace(text)
	if n := utf8.RuneCountInString(text); n < 1 || n > signal.ChatMaxRunes {
		return 0, signal.Errf(signal.CodeSDPInvalid, "채팅은 1~500자")
	}
	var ts int64
	e := r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil {
			return signal.Errf(signal.CodeNotFound, "참가자 없음")
		}
		if !p.chatRate.allow(time.Now()) {
			return signal.Errf(signal.CodeRateLimited, "채팅 속도 제한")
		}
		ts = nowMs()
		r.notify(peerID, signal.NChat, signal.ChatNtf{PeerID: peerID, Name: p.Ticket.Name, Text: text, Ts: ts})
		return nil
	})
	return ts, e
}

// sendHand — ntf hand{p} → presenter·panel·p 본인.
func (r *Room) sendHand(p *Peer) {
	n := signal.Notification{M: signal.NHand, D: signal.HandNtf{PeerID: p.ID, RaisedTs: p.raisedTs}}
	for _, q := range r.peers {
		if (q == p || q.Role != signal.RoleAudience) && q.Session != nil {
			q.Session.Send(n)
		}
	}
}

// SetHand — hand.set. audience 만. 이미 올렸으면 처음 시각 유지·알림 없음.
func (r *Room) SetHand(peerID string, raised bool) (int64, *signal.Error) {
	var ts int64
	e := r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil {
			return signal.Errf(signal.CodeNotFound, "참가자 없음")
		}
		if p.Role != signal.RoleAudience {
			return signal.Errf(signal.CodeRoleForbidden, "손들기는 청중만")
		}
		was := p.raisedTs
		if !raised {
			p.raisedTs = 0
		} else if p.raisedTs == 0 {
			p.raisedTs = nowMs()
		}
		if p.raisedTs != was {
			r.sendHand(p)
		}
		ts = p.raisedTs
		return nil
	})
	return ts, e
}

// LowerAllHands — hand.lowerAll. presenter 만.
func (r *Room) LowerAllHands(peerID string) *signal.Error {
	return r.call(func() *signal.Error {
		if e := r.requirePresenter(peerID); e != nil {
			return e
		}
		for _, q := range r.peers {
			if q.raisedTs != 0 {
				q.raisedTs = 0
				r.sendHand(q)
			}
		}
		return nil
	})
}

// React — reaction.send. 허용 7종·1~3개·피어당 초당 2건. 첫 반응이 연 300ms 창에 합산해 전원에게 익명 1회.
func (r *Room) React(peerID string, emojis []string) *signal.Error {
	if len(emojis) < 1 || len(emojis) > signal.ReactionMaxEmojis {
		return signal.Errf(signal.CodeSDPInvalid, "반응은 1~3개")
	}
	for _, em := range emojis {
		if !slices.Contains(signal.ReactionEmojis[:], em) {
			return signal.Errf(signal.CodeSDPInvalid, "허용되지 않은 반응")
		}
	}
	return r.call(func() *signal.Error {
		p := r.peers[peerID]
		if p == nil {
			return signal.Errf(signal.CodeNotFound, "참가자 없음")
		}
		if !p.reactRate.allow(time.Now()) {
			return signal.Errf(signal.CodeRateLimited, "반응 속도 제한")
		}
		for _, em := range emojis {
			r.reactions[em]++
		}
		if r.reactTimer == nil {
			r.reactTimer = time.AfterFunc(ReactionWindow, func() { r.do(r.flushReactions) })
		}
		return nil
	})
}

func (r *Room) flushReactions() {
	r.reactTimer = nil
	if len(r.reactions) == 0 {
		return
	}
	counts := r.reactions
	r.reactions = map[string]int{}
	r.notify("", signal.NReaction, signal.ReactionNtf{Counts: counts, Ts: nowMs()})
}

// ── 역할 ──

func (r *Room) requirePresenter(peerID string) *signal.Error {
	p := r.peers[peerID]
	if p == nil {
		return signal.Errf(signal.CodeNotFound, "참가자 없음")
	}
	if p.Role != signal.RolePresenter {
		return signal.Errf(signal.CodeRoleForbidden, "발표자만")
	}
	return nil
}

// RequirePresenter — room.end 권한 검사(Manager 가 방 정리 전에 부른다).
func (r *Room) RequirePresenter(peerID string) *signal.Error {
	return r.call(func() *signal.Error { return r.requirePresenter(peerID) })
}

// SetRole — peer.setRole. presenter 만, 대상은 presenter 가 아닌 사람, role 은 panel|audience.
// 승격 : 역할 → 손 내림(ntf hand 0) → roleChanged(전원) → 승격된 사람에게 올라간 손마다 ntf hand.
// 강등 : 역할 → 그 사람 producer 전부 닫힘 연쇄(producerClosed)·발행 PC 닫기 → roleChanged(전원).
func (r *Room) SetRole(byID, targetID string, role signal.Role) *signal.Error {
	return r.call(func() *signal.Error {
		if e := r.requirePresenter(byID); e != nil {
			return e
		}
		if role != signal.RolePanel && role != signal.RoleAudience {
			return signal.Errf(signal.CodeSDPInvalid, "role 은 panel|audience")
		}
		q := r.peers[targetID]
		if q == nil {
			return signal.Errf(signal.CodeNotFound, "대상 없음")
		}
		if q.Role == signal.RolePresenter {
			return signal.Errf(signal.CodeRoleForbidden, "발표자의 역할은 바꿀 수 없음")
		}
		if q.Role == role {
			return nil
		}
		q.Role = role
		changed := signal.RoleChanged{PeerID: q.ID, Role: role, By: byID}
		if role == signal.RolePanel {
			if q.raisedTs != 0 {
				q.raisedTs = 0
				r.sendHand(q)
			}
			r.notify("", signal.NRoleChanged, changed)
			for _, o := range r.peers {
				if o.raisedTs != 0 && q.Session != nil {
					q.Session.Send(signal.Notification{M: signal.NHand, D: signal.HandNtf{PeerID: o.ID, RaisedTs: o.raisedTs}})
				}
			}
			return nil
		}
		for id := range q.Producers {
			r.closeProducer(id)
		}
		// ponytail: 발행 PC 도 닫는다 — 다시 승격되면 새 transport.publish 가 새 PC 를 만든다(이전 PC 재협상 경로 없음)
		if q.Pub != nil {
			_ = q.Pub.Close()
			q.Pub = nil
		}
		clear(q.pubMids)
		clear(q.pendTracks)
		r.notify("", signal.NRoleChanged, changed)
		return nil
	})
}
