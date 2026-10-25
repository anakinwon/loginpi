// RFC 6455 WebSocket 최소 구현(표준 라이브러리만) — 텍스트·이진 프레임·조각 이어 붙이기·ping/pong·close, 클라이언트 마스킹.
// 서버 쪽은 Upgrade(net/http Hijack), 클라이언트 쪽 DialWS 는 시험·부하 봇용(ws:// 만, wss 는 앞단 프록시가 맡는다).
package signal

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	wsGUID       = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11" // RFC 6455 1.3
	opCont       = 0x0
	opText       = 0x1
	opBinary     = 0x2
	opClose      = 0x8
	opPing       = 0x9
	opPong       = 0xA
	writeTimeout = 10 * time.Second
)

var (
	errWSProtocol = errors.New("ws: 프로토콜 위반")
	errWSTooBig   = errors.New("ws: 메시지 크기 초과")
)

// WSConn — WebSocket 연결 1개. 읽기는 고루틴 1개 전용, 쓰기는 wmu 로 직렬화(여러 고루틴 안전).
type WSConn struct {
	c      net.Conn
	r      *bufio.Reader
	client bool // true 면 보내는 프레임을 마스킹하고 받는 프레임은 마스킹되지 않아야 한다
	max    int
	wmu    sync.Mutex
}

// wsAccept — Sec-WebSocket-Accept 값.
func wsAccept(key string) string {
	h := sha1.Sum([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(h[:])
}

func headerHas(h http.Header, name, token string) bool {
	for _, v := range h.Values(name) {
		for _, p := range strings.Split(v, ",") {
			if strings.EqualFold(strings.TrimSpace(p), token) {
				return true
			}
		}
	}
	return false
}

// Upgrade — HTTP 요청을 WebSocket 으로 전환한다. 실패하면 응답을 이미 쓴 상태로 오류를 돌려준다.
func Upgrade(w http.ResponseWriter, r *http.Request, maxMessage int) (*WSConn, error) {
	key := r.Header.Get("Sec-WebSocket-Key")
	if r.Method != http.MethodGet || !headerHas(r.Header, "Connection", "upgrade") ||
		!headerHas(r.Header, "Upgrade", "websocket") || r.Header.Get("Sec-WebSocket-Version") != "13" || key == "" {
		http.Error(w, "websocket 요청이 아님", http.StatusBadRequest)
		return nil, errWSProtocol
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack 불가", http.StatusInternalServerError)
		return nil, errors.New("ws: hijack 불가")
	}
	c, brw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	_ = c.SetWriteDeadline(time.Now().Add(writeTimeout))
	_, err = fmt.Fprintf(brw, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", wsAccept(key))
	if err == nil {
		err = brw.Flush()
	}
	if err != nil {
		c.Close()
		return nil, err
	}
	_ = c.SetWriteDeadline(time.Time{})
	return &WSConn{c: c, r: brw.Reader, max: maxMessage}, nil
}

// DialWS — ws:// 클라이언트 연결(시험·부하 봇용). origin 이 비어 있지 않으면 Origin 헤더를 보낸다.
func DialWS(rawURL, origin string, maxMessage int) (*WSConn, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "ws" {
		return nil, errors.New("ws: ws:// 만 지원")
	}
	c, err := net.DialTimeout("tcp", u.Host, 5*time.Second)
	if err != nil {
		return nil, err
	}
	var kb [16]byte
	_, _ = rand.Read(kb[:])
	key := base64.StdEncoding.EncodeToString(kb[:])
	req := "GET " + u.RequestURI() + " HTTP/1.1\r\nHost: " + u.Host + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
		"Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n"
	if origin != "" {
		req += "Origin: " + origin + "\r\n"
	}
	if _, err := io.WriteString(c, req+"\r\n"); err != nil {
		c.Close()
		return nil, err
	}
	br := bufio.NewReader(c)
	res, err := http.ReadResponse(br, nil)
	if err != nil {
		c.Close()
		return nil, err
	}
	if res.StatusCode != http.StatusSwitchingProtocols || res.Header.Get("Sec-WebSocket-Accept") != wsAccept(key) {
		c.Close()
		return nil, fmt.Errorf("ws: 업그레이드 실패 %d", res.StatusCode)
	}
	return &WSConn{c: c, r: br, client: true, max: maxMessage}, nil
}

// SetReadDeadline — 다음 읽기 기한.
func (w *WSConn) SetReadDeadline(t time.Time) error { return w.c.SetReadDeadline(t) }

// Close — close 프레임(가능하면)을 보내고 연결을 닫는다.
func (w *WSConn) Close() error {
	_ = w.writeFrame(opClose, []byte{0x03, 0xE8}) // 1000 정상 종료
	return w.c.Close()
}

// ReadMessage — 텍스트·이진 메시지 1개(조각은 이어 붙임). ping 은 pong 으로 답하고, close 를 받으면 io.EOF.
func (w *WSConn) ReadMessage() (op byte, msg []byte, err error) {
	for {
		fin, fop, p, err := w.readFrame()
		if err != nil {
			return 0, nil, err
		}
		switch fop {
		case opPing:
			if err := w.writeFrame(opPong, p); err != nil {
				return 0, nil, err
			}
		case opPong:
		case opClose:
			_ = w.writeFrame(opClose, nil)
			return 0, nil, io.EOF
		case opText, opBinary:
			if msg != nil {
				return 0, nil, errWSProtocol // 이전 메시지 조각이 끝나기 전에 새 메시지
			}
			op, msg = fop, p
			if fin {
				return op, msg, nil
			}
			if msg == nil {
				msg = []byte{}
			}
		case opCont:
			if msg == nil {
				return 0, nil, errWSProtocol
			}
			if len(msg)+len(p) > w.max {
				return 0, nil, errWSTooBig
			}
			msg = append(msg, p...)
			if fin {
				return op, msg, nil
			}
		default:
			return 0, nil, errWSProtocol
		}
	}
}

func (w *WSConn) readFrame() (fin bool, op byte, payload []byte, err error) {
	var h [2]byte
	if _, err = io.ReadFull(w.r, h[:]); err != nil {
		return
	}
	if h[0]&0x70 != 0 { // RSV 는 확장 협상 없이는 0
		return false, 0, nil, errWSProtocol
	}
	fin, op = h[0]&0x80 != 0, h[0]&0x0F
	masked := h[1]&0x80 != 0
	n := uint64(h[1] & 0x7F)
	switch n {
	case 126:
		var b [2]byte
		if _, err = io.ReadFull(w.r, b[:]); err != nil {
			return
		}
		n = uint64(binary.BigEndian.Uint16(b[:]))
	case 127:
		var b [8]byte
		if _, err = io.ReadFull(w.r, b[:]); err != nil {
			return
		}
		n = binary.BigEndian.Uint64(b[:])
	}
	if masked == w.client { // 클라이언트→서버는 반드시 마스킹, 서버→클라이언트는 마스킹 금지(RFC 6455 5.1)
		return false, 0, nil, errWSProtocol
	}
	if op >= opClose && (n > 125 || !fin) {
		return false, 0, nil, errWSProtocol
	}
	if n > uint64(w.max) {
		return false, 0, nil, errWSTooBig
	}
	var key [4]byte
	if masked {
		if _, err = io.ReadFull(w.r, key[:]); err != nil {
			return
		}
	}
	payload = make([]byte, n)
	if _, err = io.ReadFull(w.r, payload); err != nil {
		return
	}
	if masked {
		for i := range payload {
			payload[i] ^= key[i&3]
		}
	}
	return
}

// WriteText — 텍스트 메시지 1개(단일 프레임).
func (w *WSConn) WriteText(p []byte) error { return w.writeFrame(opText, p) }

func (w *WSConn) writeFrame(op byte, p []byte) error {
	buf := make([]byte, 0, len(p)+14)
	buf = append(buf, 0x80|op)
	var mbit byte
	if w.client {
		mbit = 0x80
	}
	switch n := len(p); {
	case n < 126:
		buf = append(buf, mbit|byte(n))
	case n <= 0xFFFF:
		buf = append(buf, mbit|126)
		buf = binary.BigEndian.AppendUint16(buf, uint16(n))
	default:
		buf = append(buf, mbit|127)
		buf = binary.BigEndian.AppendUint64(buf, uint64(n))
	}
	if w.client {
		var key [4]byte
		_, _ = rand.Read(key[:])
		buf = append(buf, key[:]...)
		start := len(buf)
		buf = append(buf, p...)
		for i := range p {
			buf[start+i] ^= key[i&3]
		}
	} else {
		buf = append(buf, p...)
	}
	w.wmu.Lock()
	defer w.wmu.Unlock()
	_ = w.c.SetWriteDeadline(time.Now().Add(writeTimeout))
	_, err := w.c.Write(buf)
	return err
}
