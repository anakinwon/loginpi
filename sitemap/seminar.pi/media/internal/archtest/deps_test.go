// M3 관문 테스트 — "모듈 의존이 3.1절 구조와 일치"(PRD_02 6절 M3 행 · PRD_01 5절 M3 통과 기준)를 자동 검사한다.
// media/cmd·internal 아래 패키지의 운영 코드 import(테스트 파일 제외)를 go/build 로 읽어 아래 허용표와 대조한다.
// 실행 : go test ./internal/archtest
package archtest

import (
	"go/build"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"
)

const module = "seminar.pi/media"

// allowed — 패키지별로 import 해도 되는 내부 패키지(모듈 경로 뒤, "internal/" 생략).
// 근거는 PRD_02 3.1(패키지 역할) · 3.3(모듈 인터페이스 시그니처) · 4.1(정방향 1~10단계) · 4.2(역방향 RTCP) · 4.3(소유 규칙).
// 표에 없는 import 는 실패다. 표를 넓히려면 PRD_02 근거를 주석에 먼저 적는다(조용히 넓히지 않는다).
var allowed = map[string][]string{
	// 3.1 cmd/galapagos : 설정 로드 · UDP mux(capri) · HTTP(WSS) 서버(signal) — 방 관리자(bora.Manager)가 signal.Handler 구현
	"cmd/galapagos": {"bora", "capri", "signal"},

	// 3.3 signal : 연결·봉투·입장권만 — 방 로직은 Handler 구현(bora)이 맡는다. 내부 의존 없음
	"signal": {},

	// 3.3 bora : Join(t Ticket, s Session) → signal · Produce → *santorini.Producer · Consume → *jeju.Consumer
	//            · Leave = Transport 닫힘 연쇄 → capri · 구독 PC 당 Allocator(3.3 bwe·4.3) → bwe
	//            · LayerSource.RequestKeyframe(reason pli.Reason)(3.3 santorini) 호출자 → pli
	//            · 녹화기 = 내부 Consumer, 할당기에서 뺌(3.3 record) → record
	//            · metrics M5 내보내기(3.3 metrics, 관리 API bora/admin.go) → metrics
	"bora": {"bwe", "capri", "jeju", "metrics", "pli", "record", "santorini", "signal"},

	// 3.3 capri : pion PC·ICE·RTCP 읽기. RR/NACK/PLI/REMB 분배는 콜백(RTCPSink·OnREMB)으로 — import 없음(bora→capri 순환 방지)
	"capri": {},

	// 4.1 1~5단계 : rtpx.Extend·VP8 키프레임 → nack.PacketCache·LossTracker → pli.Limiter → forward.Queue.Offer
	//            · 상류 RR·NACK·PLI 생성(3.3 rtcpx) · 수신 패킷·키프레임 카운터(3.3 metrics)
	"santorini": {"forward", "metrics", "nack", "pli", "rtcpx", "rtpx"},

	// 4.1 6~10단계 : forward.Item → cache.GetAt(nack) → SeqRewriter·VP8 picture ID(3.1 rtpx) → SendMeta(nack)
	//            · 4.2 청중 PLI → santorini Limiter(pli.Reason) · 하류 SR 0.5초·RTT(rtcpx) · 송신·재전송 카운터(3.3 metrics)
	"jeju": {"forward", "metrics", "nack", "pli", "rtcpx", "rtpx", "santorini"},

	// 3.3 forward : (extSeq, idx, flags)만 담는 구독자별 큐 — 큐 버림 카운터(3.3 metrics)만
	"forward": {"metrics"},

	// 3.3 nack·pli·bwe·rtcpx·rtpx·metrics : 잎(leaf) 패키지 — 내부 의존 없음
	// (bwe 는 ConsumerView 값 복사·Target 인터페이스로 jeju 를 모른다 — 3.3 bwe)
	"nack":    {},
	"pli":     {},
	"bwe":     {},
	"rtcpx":   {},
	"rtpx":    {},
	"metrics": {},

	// 3.3 record : 녹화기 = 내부 Consumer 1개 → jeju.Writer 구현
	"record": {"jeju"},
}

// externalOK — 운영 코드가 쓸 수 있는 외부 모듈(S-1 pion 만, OWNERSHIP "새 외부 Go 의존성 금지").
var externalOK = []string{"github.com/pion/"}

// skip — 검사 대상이 아닌 디렉터리(이 관문 자신).
var skip = map[string]bool{"internal/archtest": true}

func TestModuleDepsMatchPRD02(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, top := range []string{"cmd", "internal"} {
		dirs, err := os.ReadDir(filepath.Join(root, top))
		if err != nil {
			t.Fatal(err)
		}
		for _, d := range dirs {
			rel := top + "/" + d.Name()
			if !d.IsDir() || skip[rel] {
				continue
			}
			// ponytail: 현재 GOOS 기준 파일만 읽는다 — OS별 파일(_linux.go 등)이 생기면 GOOS 를 돌며 검사
			pkg, err := build.Default.ImportDir(filepath.Join(root, top, d.Name()), 0)
			if err != nil {
				t.Errorf("%s 읽기 실패: %v", rel, err)
				continue
			}
			key := strings.TrimPrefix(rel, "internal/")
			seen[key] = true
			allow, ok := allowed[key]
			if !ok {
				t.Errorf("%s : 허용표에 없는 새 패키지 — PRD_02 3.1 근거와 함께 allowed 에 추가", rel)
				continue
			}
			for _, imp := range pkg.Imports {
				switch {
				case strings.HasPrefix(imp, module+"/"):
					dep := strings.TrimPrefix(strings.TrimPrefix(imp, module+"/"), "internal/")
					if !slices.Contains(allow, dep) {
						t.Errorf("구조도 위반 %s → %s (파일 : %s)", key, dep, filesImporting(pkg, imp))
					}
				case !strings.Contains(strings.Split(imp, "/")[0], "."): // 표준 라이브러리
				default:
					if !slices.ContainsFunc(externalOK, func(p string) bool { return strings.HasPrefix(imp, p) }) {
						t.Errorf("허용되지 않은 외부 의존 %s → %s (S-1·새 외부 의존성 금지)", key, imp)
					}
				}
			}
		}
	}
	for key := range allowed {
		if !seen[key] {
			t.Errorf("허용표의 %s 패키지가 없음 — 표 정리 필요", key)
		}
	}
}

// filesImporting — 위반 보고용 : imp 를 import 하는 운영 파일 이름.
func filesImporting(pkg *build.Package, imp string) string {
	var out []string
	for _, f := range pkg.GoFiles {
		b, err := os.ReadFile(filepath.Join(pkg.Dir, f))
		if err == nil && strings.Contains(string(b), `"`+imp+`"`) {
			out = append(out, f)
		}
	}
	sort.Strings(out)
	return strings.Join(out, ",")
}
