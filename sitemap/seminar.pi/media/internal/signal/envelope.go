// 시그널링 봉투·메시지 이름·오류 코드·페이로드 타입(PRD_02 5.1·5.2). 이름·필드 변경은 M3(SIGNAL_API.md)과 합의 후에만.
package signal

import "encoding/json"

// 봉투 종류.
const (
	TypeReq = "req"
	TypeRes = "res"
	TypeNtf = "ntf"
)

// Envelope — {"t","id","m","ok","d","e"}. 요청/응답은 id 로 짝, 알림은 id 없음.
type Envelope struct {
	T  string          `json:"t"`
	ID int64           `json:"id,omitempty"`
	M  string          `json:"m,omitempty"`
	OK *bool           `json:"ok,omitempty"` // 응답에만. false 도 직렬화되도록 포인터
	D  json.RawMessage `json:"d,omitempty"`
	E  *Error          `json:"e,omitempty"`
}

// 메서드(C→S 요청)·알림 이름. 단계 표기는 PRD_02 5.2.
const (
	MJoin                     = "join"                       // M1
	MTransportPublish         = "transport.publish"          // M1 offer → answer
	MProduce                  = "produce"                    // M1
	MTransportSubscribeAnswer = "transport.subscribe.answer" // M1
	MTrickle                  = "trickle"                    // M1 양방향
	MConsumerResume           = "consumer.resume"            // M3
	MConsumerSetLayer         = "consumer.setLayer"          // M3 정의·M4 사용
	MProducerPause            = "producer.pause"             // M3
	MProducerResume           = "producer.resume"            // M3
	MProducerClose            = "producer.close"             // M3
	MPing                     = "ping"                       // M1 양방향
	MPong                     = "pong"                       // M1
	MLeave                    = "leave"                      // M1

	NTransportSubscribe = "transport.subscribe" // M1 서버 offer(200ms 묶음)
	NConsumerCreated    = "consumerCreated"     // M1
	NProducerClosed     = "producerClosed"      // M3
	NProducerPaused     = "producerPaused"      // M3
	NProducerResumed    = "producerResumed"     // M3
	NLayersChanged      = "layersChanged"       // M4
	NStreamState        = "streamState"         // M4
	NPublishLayers      = "publishLayers"       // M4 dynacast
	NScore              = "score"               // M4
	NError              = "error"               // M1
)

// ErrCode — 오류 코드(PRD_02 5.2).
type ErrCode string

const (
	CodeTicketInvalid    ErrCode = "TICKET_INVALID"
	CodeTicketExpired    ErrCode = "TICKET_EXPIRED"
	CodeRoomFull         ErrCode = "ROOM_FULL"
	CodeRoleForbidden    ErrCode = "ROLE_FORBIDDEN"
	CodeRoomClosed       ErrCode = "ROOM_CLOSED"
	CodeDuplicateSession ErrCode = "DUPLICATE_SESSION"
	CodeSDPInvalid       ErrCode = "SDP_INVALID"
	CodeNotFound         ErrCode = "NOT_FOUND"
	CodeRateLimited      ErrCode = "RATE_LIMITED"
	CodeInternal         ErrCode = "INTERNAL"
)

// Error — 응답 e 필드·ntf error 데이터. error 인터페이스를 만족한다.
type Error struct {
	Code ErrCode `json:"code"`
	Msg  string  `json:"msg"`
}

func (e *Error) Error() string { return string(e.Code) + ": " + e.Msg }

// Errf — 오류 값 생성 도우미.
func Errf(code ErrCode, msg string) *Error { return &Error{Code: code, Msg: msg} }

// ── 페이로드(d) ──

type JoinReq struct {
	Ticket string `json:"ticket"`
}

// ICEServer — pion 타입을 signal 에 끌어오지 않으려고 따로 둔다.
type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

type ProducerInfo struct {
	ID   string `json:"id"`
	Kind string `json:"kind"` // "audio"|"video"
	Peer string `json:"peer"`
}

type JoinRes struct {
	PeerID     string         `json:"peerId"`
	Role       Role           `json:"role"`
	IceServers []ICEServer    `json:"iceServers"`
	Producers  []ProducerInfo `json:"producers"`
}

// SDP — transport.publish 요청·응답, ntf transport.subscribe, transport.subscribe.answer.
type SDP struct {
	SDP string `json:"sdp"`
}

type ProduceReq struct {
	Mid    string   `json:"mid"`
	Kind   string   `json:"kind"`   // "audio"|"video"
	Source string   `json:"source"` // "camera"|"screen"|"mic"
	Rids   []string `json:"rids,omitempty"`
}

type ProduceRes struct {
	ProducerID string `json:"producerId"`
}

type Trickle struct {
	PC        string          `json:"pc"`        // "pub"|"sub"
	Candidate json.RawMessage `json:"candidate"` // webrtc.ICECandidateInit JSON 그대로
}

type ConsumerCreated struct {
	ConsumerID string `json:"consumerId"`
	ProducerID string `json:"producerId"`
	Mid        string `json:"mid"`
	Kind       string `json:"kind"`
	Paused     bool   `json:"paused"`
}

type ConsumerRef struct {
	ConsumerID string `json:"consumerId"`
}

type ProducerRef struct {
	ProducerID string `json:"producerId"`
}

type SetLayer struct {
	ConsumerID  string `json:"consumerId"`
	MaxSpatial  int8   `json:"maxSpatial"`
	MaxTemporal *int8  `json:"maxTemporal,omitempty"`
}

type LayersChanged struct {
	ConsumerID string `json:"consumerId"`
	Spatial    int8   `json:"spatial"`
	Temporal   int8   `json:"temporal"`
}

type StreamState struct {
	ConsumerID string `json:"consumerId"`
	State      string `json:"state"` // "active"|"paused"
}

type PublishLayers struct {
	ProducerID string          `json:"producerId"`
	Rids       map[string]bool `json:"rids"`
}

type ScoreNtf struct {
	ConsumerID string  `json:"consumerId,omitempty"`
	ProducerID string  `json:"producerId,omitempty"`
	Score      float64 `json:"score"`
	Grade      string  `json:"grade"`
}
