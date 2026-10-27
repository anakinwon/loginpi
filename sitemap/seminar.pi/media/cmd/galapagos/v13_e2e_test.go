// v1.3 통합 테스트 — 실제 /signal 에 봇(발표자 P·패널 N·청중 A)을 붙여 SIGNAL_API 3.6 app.send 를 끝에서 끝까지 확인 :
// 주제·역할·크기 오류 코드, ntf app 의 받는 사람(보낸 본인 제외)·d 그대로·from = 서버가 채운 peerId.
// 실행 : go test ./cmd/galapagos -run V13 (네트워크 = 로컬 루프백만)
package main

import (
	"encoding/json"
	"strings"
	"testing"

	"seminar.pi/media/internal/signal"
)

func TestV13AppRelay(t *testing.T) {
	url := startEngine(t)
	p, pj := joinBot(t, url, "v13", "P", signal.RolePresenter)
	n, nj := joinBot(t, url, "v13", "N", signal.RolePanel)
	a, aj := joinBot(t, url, "v13", "A", signal.RoleAudience)

	for _, st := range []struct {
		name string
		b    *bot
		d    any
		want signal.ErrCode
	}{
		{"청중 caption", a, map[string]any{"topic": "caption", "d": map[string]string{"text": "x"}}, signal.CodeRoleForbidden},
		{"패널 state", n, map[string]any{"topic": "state", "d": map[string]bool{"recording": true}}, signal.CodeRoleForbidden},
		{"표에 없는 주제", p, map[string]any{"topic": "chat"}, signal.CodeNotFound},
		{"d 4KB 초과", p, map[string]any{"topic": "caption", "d": strings.Repeat("a", signal.AppMaxBytes)}, signal.CodeSDPInvalid},
		{"d 형식 오류", p, map[string]any{"topic": 1}, signal.CodeSDPInvalid},
	} {
		if e := st.b.try(signal.MAppSend, st.d); errCode(e) != st.want {
			t.Errorf("%s : %+v 기대 %q", st.name, e.E, st.want)
		}
	}

	p.request(signal.MAppSend, map[string]any{"topic": "state", "d": map[string]bool{"recording": true}}, nil)
	n.request(signal.MAppSend, map[string]any{"topic": "caption", "d": map[string]string{"text": "안녕하세요"}}, nil)
	a.request(signal.MAppSend, map[string]any{"topic": "refresh"}, nil)

	wantState := `{"topic":"state","d":{"recording":true},"from":"` + pj.PeerID + `"}`
	for _, b := range []*bot{n, a} {
		if d := b.wait(t, signal.NApp, has(`"state"`)); string(d) != wantState {
			t.Errorf("state 알림 %s 기대 %s", d, wantState)
		}
	}
	a.wait(t, signal.NApp, has(`"from":"`+nj.PeerID+`"`))
	d := p.wait(t, signal.NApp, has(`"refresh"`))
	var got signal.AppNtf
	if err := json.Unmarshal(d, &got); err != nil || got.From != aj.PeerID || string(got.D) != "null" {
		t.Errorf("refresh 알림 %s", d)
	}
	p.wait(t, signal.NApp, has(`"caption"`))
	// 보낸 본인은 자기 중계를 받지 않는다(같은 방 고루틴 순서라 뒤의 알림이 왔으면 앞의 것은 이미 왔다)
	for _, st := range []struct {
		b     *bot
		topic string
	}{{p, `"state"`}, {n, `"caption"`}, {a, `"refresh"`}} {
		if _, ok := st.b.find(signal.NApp, has(st.topic)); ok {
			t.Errorf("보낸 사람이 자기 %s 를 받음", st.topic)
		}
	}
}
