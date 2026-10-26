// 시그널링 v1.2 방 동작(SIGNAL_API 3.5) — 후속 E 사회(peer.mute·room.muteAll 잠금·peer.askUnmute), F 레이아웃(room.setLayout 보관·입장 시 전달),
// G 발언자(ntf activeSpeaker). 전부 방 고루틴 한 처리 안에서 잠금 → 일시정지 → 알림 순서로 끝낸다(경합 원천 차단). 권한은 세션 역할(Peer.Role).
package bora

import (
	"time"

	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// muteKind — 요청 kind → Producer 종류. audio = 음성 전부, video = 카메라(화면공유는 사회 대상 아님).
func muteKind(kind string) (santorini.Kind, *signal.Error) {
	switch kind {
	case "audio":
		return santorini.Audio, nil
	case "video":
		return santorini.Video, nil
	}
	return 0, signal.Errf(signal.CodeSDPInvalid, "kind 는 audio|video")
}

func mutable(pr *santorini.Producer, k santorini.Kind) bool {
	return pr.Kind() == k && (k == santorini.Audio || pr.Source() != santorini.Screen)
}

// lockedFor — 방 고루틴 전용. 잠금 중 그 사람이 그 producer 종류를 켜거나 새로 발행할 수 없는가(발표자는 잠금 대상 아님).
func (r *Room) lockedFor(p *Peer, k santorini.Kind, src santorini.Source) bool {
	if p.Role == signal.RolePresenter {
		return false
	}
	if k == santorini.Audio {
		return r.locks.Audio
	}
	return r.locks.Video && src != santorini.Screen
}

// mutePeer — 방 고루틴 전용. q 의 k 종류 producer 를 일시정지(다른 참가자에게 producerPaused)하고, 새로 멈춘 것이 있으면 q 에게 ntf mutedBy.
func (r *Room) mutePeer(q *Peer, k santorini.Kind, kind, by string) {
	var ids []string
	for id, pr := range q.Producers {
		if mutable(pr, k) && !r.paused[id] {
			r.setProducerPaused(pr, true)
			ids = append(ids, id)
		}
	}
	if len(ids) > 0 && q.Session != nil {
		q.Session.Send(signal.Notification{M: signal.NMutedBy, D: signal.MutedBy{Kind: kind, By: by, ProducerIDs: ids}})
	}
}

// target — 사회 요청 대상 검사 : 요청자 presenter, 대상 존재·presenter 아님.
func (r *Room) target(byID, targetID string) (*Peer, *signal.Error) {
	if e := r.requirePresenter(byID); e != nil {
		return nil, e
	}
	q := r.peers[targetID]
	if q == nil {
		return nil, signal.Errf(signal.CodeNotFound, "대상 없음")
	}
	if q.Role == signal.RolePresenter {
		return nil, signal.Errf(signal.CodeRoleForbidden, "발표자는 대상이 아님")
	}
	return q, nil
}

// MutePeer — peer.mute. presenter 만, 대상은 presenter 가 아닌 사람. 이미 꺼져 있거나 발행이 없으면 성공·알림 없음.
func (r *Room) MutePeer(byID, targetID, kind string) *signal.Error {
	k, e := muteKind(kind)
	if e != nil {
		return e
	}
	return r.call(func() *signal.Error {
		q, e := r.target(byID, targetID)
		if e != nil {
			return e
		}
		r.mutePeer(q, k, kind, byID)
		return nil
	})
}

// MuteAll — room.muteAll. presenter 만. ① 잠금 표시(lock) 또는 해제 ② 발표자 외 전원의 그 종류 일시정지 + 각자 ntf mutedBy
// ③ 잠금이 바뀌었으면 전원 ntf roomPolicy. 한 방 고루틴 처리 안이라 ①과 ② 사이에 producer.resume 이 끼어들 수 없다.
func (r *Room) MuteAll(byID, kind string, lock bool) *signal.Error {
	k, e := muteKind(kind)
	if e != nil {
		return e
	}
	return r.call(func() *signal.Error {
		if e := r.requirePresenter(byID); e != nil {
			return e
		}
		was := r.locks
		if k == santorini.Audio {
			r.locks.Audio = lock
		} else {
			r.locks.Video = lock
		}
		for _, q := range r.peers {
			if q.Role != signal.RolePresenter {
				r.mutePeer(q, k, kind, byID)
			}
		}
		if r.locks != was {
			r.notify("", signal.NRoomPolicy, signal.RoomPolicy{Locked: r.locks})
		}
		return nil
	})
}

// AskUnmute — peer.askUnmute. presenter 만, 대상은 발행할 수 있는 사람(panel). 잠금 중이면 LOCKED. 대상에게 ntf askUnmute 만 — 켜는 것은 본인 탭.
func (r *Room) AskUnmute(byID, targetID, kind string) *signal.Error {
	k, e := muteKind(kind)
	if e != nil {
		return e
	}
	return r.call(func() *signal.Error {
		q, e := r.target(byID, targetID)
		if e != nil {
			return e
		}
		if !q.Role.CanProduce() {
			return signal.Errf(signal.CodeRoleForbidden, "청중은 발행할 수 없음")
		}
		if r.lockedFor(q, k, santorini.Camera) {
			return signal.Errf(signal.CodeLocked, "잠금 중")
		}
		if q.Session != nil {
			q.Session.Send(signal.Notification{M: signal.NAskUnmute, D: signal.AskUnmute{Kind: kind, By: byID}})
		}
		return nil
	})
}

// SetLayout — room.setLayout. presenter 만. mode auto(spotlight 비움)|spotlight(키 1~64자). 방에 보관(입장 응답 layout)하고, 바뀌었으면 전원 ntf layout.
func (r *Room) SetLayout(byID string, l signal.Layout) *signal.Error {
	switch {
	case l.Mode == "auto":
		l.Spotlight = ""
	case l.Mode == "spotlight" && l.Spotlight != "" && len(l.Spotlight) <= signal.LayoutSpotlightMax:
	default:
		return signal.Errf(signal.CodeSDPInvalid, "mode 는 auto|spotlight(spotlight 는 1~64자)")
	}
	return r.call(func() *signal.Error {
		if e := r.requirePresenter(byID); e != nil {
			return e
		}
		if r.layout != nil && *r.layout == l {
			return nil
		}
		r.layout = &l
		r.notify("", signal.NLayout, l)
		return nil
	})
}

// tickSpeaker — 방 고루틴 전용, SpeakerTick 마다. 일시정지되지 않은 음성 Producer 의 평활 레벨 → 참가자별 가장 큰 값 → 판정 → 바뀌면 전원 ntf activeSpeaker.
func (r *Room) tickSpeaker(now time.Time) {
	levels := map[string]float64{}
	for id, pr := range r.producers {
		if pr.Kind() != santorini.Audio || r.paused[id] {
			continue
		}
		if v, ok := pr.AudioLevel(now); ok {
			if old, has := levels[pr.PeerID()]; !has || v < old {
				levels[pr.PeerID()] = v
			}
		}
	}
	if id, ok := r.speaker.tick(now, levels); ok {
		r.notify("", signal.NActiveSpeaker, speakerNtf(id))
	}
}

func speakerNtf(id string) signal.ActiveSpeaker {
	if id == "" {
		return signal.ActiveSpeaker{}
	}
	return signal.ActiveSpeaker{PeerID: &id}
}
