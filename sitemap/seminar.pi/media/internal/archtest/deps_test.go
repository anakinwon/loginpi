// M3 관문 테스트 — "모듈 의존이 3.1절 구조와 일치"(PRD_02 6절 M3 행 · PRD_01 5절 M3 통과 기준)를 자동 검사한다.
// 기준 = 유일하게 글로 적힌 의존 구조도 `media/OWNERSHIP.md:57`(계약 파일, 마스터 소관 — 이 테스트가 고치지 않는다).
// media/cmd·internal 아래 모든 패키지(하위 디렉터리 포함)의 운영 코드 import(테스트 파일 제외)를 go/build 로 읽어 대조한다.
// 실행 : go test -v ./internal/archtest (보류 간선은 SKIP 으로 이유와 함께 보인다)
package archtest

import (
	"go/build"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"
)

const module = "seminar.pi/media"

// diagram — OWNERSHIP.md:57 그대로 : `bora → {signal, capri, santorini, jeju, bwe}` · `jeju → {santorini, forward, nack, pli}`
// · `santorini → {forward, nack, pli, rtcpx, rtpx}` · `record → jeju` · 나머지(signal·capri·forward·nack·pli·bwe·rtcpx·rtpx·metrics)는 내부 의존 없음.
// 키 = 모듈 경로 뒤("internal/" 생략). 구조도를 넓히는 일은 OWNERSHIP.md 를 먼저 고친 뒤(마스터 승인) 여기에 옮긴다.
var diagram = map[string][]string{
	"bora":      {"signal", "capri", "santorini", "jeju", "bwe"},
	"jeju":      {"santorini", "forward", "nack", "pli"},
	"santorini": {"forward", "nack", "pli", "rtcpx", "rtpx"},
	"record":    {"jeju"},
	"signal":    {},
	"capri":     {},
	"forward":   {},
	"nack":      {},
	"pli":       {},
	"bwe":       {},
	"rtcpx":     {},
	"rtpx":      {},
	"metrics":   {},
	// cmd/galapagos 는 구조도 줄에 없다(규칙 없음) — 패키지 자체는 OWNERSHIP 1절 M1 소유로 적혀 있어 알려진 패키지로 두되,
	// 내부 간선은 하나도 구조도 근거가 없으므로 전부 pending 에 둔다.
	"cmd/galapagos": {},
}

// pending — 코드에 있으나 구조도에 없는 간선. 통과가 아니라 "마스터 승인 대기"로 SKIP 보고한다.
// 여기 없는 새 간선은 실패, 코드에서 사라진 보류 간선도 실패(목록이 썩지 않게).
const approval = " [확인중 : 마스터 — OWNERSHIP.md:57 확대 승인]"

var pending = map[string]string{
	"bora → metrics":         "관리 API `bora/admin.go` 의 GET /admin/metrics 가 metrics.Global.Snapshot() 을 내보낸다(M5). PRD_02 는 내보내기 위치를 정하지 않음",
	"bora → pli":             "녹화 Consumer 시작 시 `room.go` 가 RequestKeyframe(pli.NewConsumer) 호출 — Reason 상수 사용(santorini 시그니처가 pli.Reason 을 받음)",
	"bora → record":          "방이 Producer 별 녹화기(record.Open, `lifecycle.go` recording)를 만든다(M5). 구조도는 record → jeju 만 적음",
	"jeju → metrics":         "송신·재전송·레이어 전환 카운터(metrics.Global.PacketsOut·NACKIn·LayerSwitches) — `consumer.go`·`retransmit.go`·`layerpolicy.go`",
	"jeju → rtcpx":           "하류 SR 0.5초 주기·RTP 시각 외삽(rtcpx.SRInterval·ExtrapolateRTP) — `consumer.go`(PRD_02 4.2 하류 SR)",
	"jeju → rtpx":            "레이어 전환 시 VP8 picture ID 다시 쓰기(rtpx.VP8Munger) — `layerpolicy.go`",
	"santorini → metrics":    "수신 패킷·NACK·PLI 송신 카운터(metrics.Global.PacketsIn·NACKOut·PLIOut) — `layer.go`·`feedback.go`",
	"forward → metrics":      "혼잡 큐 버림 카운터(metrics.Global.QueueDrops) — `congest.go`",
	"cmd/galapagos → bora":   "진입점이 방 관리자(bora.Manager = signal.Handler)·관리 API(bora.AdminHandler)를 만든다 — `main.go`",
	"cmd/galapagos → capri":  "진입점이 UDP mux·API 설정(capri.Config·NewAPI)을 만든다 — `main.go`",
	"cmd/galapagos → signal": "진입점이 /signal WS 서버(signal.NewServer·NewVerifier)를 건다 — `main.go`",
}

// externalOK — 운영 코드가 쓸 수 있는 외부 모듈(S-1 pion 만, OWNERSHIP "새 외부 Go 의존성 금지").
var externalOK = []string{"github.com/pion/"}

// skip — 검사 대상이 아닌 디렉터리(이 관문 자신).
var skip = map[string]bool{"internal/archtest": true}

func TestModuleDepsMatchOwnershipDiagram(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	present := map[string]bool{} // 코드에 실제 있는 보류 간선
	for _, top := range []string{"cmd", "internal"} {
		err := filepath.WalkDir(filepath.Join(root, top), func(path string, d fs.DirEntry, err error) error {
			if err != nil || !d.IsDir() {
				return err
			}
			relp, _ := filepath.Rel(root, path)
			rel := filepath.ToSlash(relp)
			if skip[rel] {
				return filepath.SkipDir
			}
			// ponytail: 현재 GOOS 기준 파일만 읽는다 — OS별 파일(_linux.go 등)이 생기면 GOOS 를 돌며 검사
			pkg, err := build.Default.ImportDir(path, 0)
			if _, ok := err.(*build.NoGoError); ok {
				return nil // 운영 Go 파일 없는 디렉터리(cmd·internal 자체, 테스트만 있는 곳 등)
			}
			if err != nil {
				t.Errorf("%s 읽기 실패: %v", rel, err)
				return nil
			}
			key := strings.TrimPrefix(rel, "internal/")
			seen[key] = true
			allow, ok := diagram[key]
			if !ok {
				t.Errorf("%s : 구조도(OWNERSHIP.md:57)에 없는 새 패키지 — 마스터 승인 후 OWNERSHIP 과 diagram 에 추가", rel)
				return nil
			}
			for _, imp := range pkg.Imports {
				switch {
				case strings.HasPrefix(imp, module+"/"):
					dep := strings.TrimPrefix(strings.TrimPrefix(imp, module+"/"), "internal/")
					if slices.Contains(allow, dep) {
						continue
					}
					edge := key + " → " + dep
					if _, ok := pending[edge]; ok {
						present[edge] = true
						continue
					}
					t.Errorf("구조도 위반 %s (파일 : %s) — OWNERSHIP.md:57 에도 pending 에도 없음", edge, filesImporting(pkg, imp))
				case !strings.Contains(strings.Split(imp, "/")[0], "."): // 표준 라이브러리
				default:
					if !slices.ContainsFunc(externalOK, func(p string) bool { return strings.HasPrefix(imp, p) }) {
						t.Errorf("허용되지 않은 외부 의존 %s → %s (S-1·새 외부 의존성 금지)", key, imp)
					}
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	for key := range diagram {
		if !seen[key] {
			t.Errorf("구조도의 %s 패키지가 코드에 없음 — diagram 정리 필요", key)
		}
	}
	edges := make([]string, 0, len(pending))
	for e := range pending {
		edges = append(edges, e)
	}
	sort.Strings(edges)
	for _, e := range edges {
		t.Run("pending/"+e, func(t *testing.T) {
			if !present[e] {
				t.Fatalf("보류 간선 %s 이 코드에 없음 — pending 에서 지울 것", e)
			}
			t.Skip("구조도 밖 간선 : " + pending[e] + approval)
		})
	}
	t.Logf("다이어그램 밖 간선 %d개, 마스터 승인 대기", len(present))
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
