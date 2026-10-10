# sitemap.pi 1차 데이터 모델 ERD

정본 `../sitemaps-data-model.md`(1.1 재점검 반영본, 2026-10-10 — 1.0 DA 최종 승인 후 정본 v2.4 재점검으로 `sys_user` 7컬럼 개명, DA 재승인 진행 중)의 물리 모델을 오픈소스 **ERD Editor** 문서로 만든 것이다.

| 파일 | 내용 |
|---|---|
| `sitemaps-data-model.erd` | ERD 문서 (JSON, 문서 스키마 `version` 3.0.0, 데이터베이스 PostgreSQL) |
| `sitemaps-data-model.png` | 렌더 이미지 (3760×3420, 편집기 배율 100%) |
| `gen-sitemaps-erd.mjs` | 생성기: DDL과 인벤토리를 읽어 위 파일을 다시 만든다 |

## 여는 법

- **VS Code**: 확장 [ERD Editor](https://marketplace.visualstudio.com/items?itemName=dineug.vuerd-vscode)(`dineug.vuerd-vscode`)를 설치한 뒤 `.erd` 파일을 열면 편집기로 열린다.
- **웹**: 웹 컴포넌트 `@dineug/erd-editor@3.10.0`(CDN UMD)에 `setInitialValue(파일내용)`로 넣는다. 이 방법으로 실제 렌더링을 확인했다(테이블 14·관계 17·메모 9). 웹 편집기 <https://erd-editor.io>의 파일 가져오기도 같은 형식이다(미확인).
- 자동 정렬(Force/Flow/Tree)은 편집기 UI에서만 쓸 수 있다. 파일에는 생성기가 계산한 주제영역별 배치가 저장되어 있다. 영역 메모와 자리표시 메모는 각 행의 왼쪽 열에 세로로 쌓고, 테이블은 그 오른쪽에 영역별로 둔다. 그래서 행을 넘나드는 관계선과 fee_ord 자기참조 고리가 메모에 가려지지 않는다.

## 재생성

```bash
cd sitemap/sitemap.pi/data-model/erd
node gen-sitemaps-erd.mjs            # 기본 경로(이 파일 기준 상대경로)로 생성
node gen-sitemaps-erd.mjs --help     # 인자: --out <file.erd> --inventory <json> --sql a.sql,b.sql,c.sql --dump-sql <file> --no-strict --no-rename
```

- 필요 조건: Node 22.12 이상. 공식 MCP 서버 `@dineug/erd-editor-mcp@0.2.0`을 `npx`로 headless 실행한다(npx 캐시에 받으며 저장소 의존성은 바꾸지 않는다).
- 원천: `packages/pi-db/sql/000_baseline.sql` → `sitemap/sitemap.pi/sql/001_sitemap_phase1.sql` → `docs/da/_workspace/20261010_sitemap-data-model/02_modeler_ddl.sql`(초안), 그리고 인벤토리 `05_erd_inventory.json`(논리명·주제영역·검증 기준).
- **000·001 = 개명 임시 사본(메모리)** : 정본 v2.4 재점검·마스터 확정에 따라 `sys_user` 7컬럼(`id→usr_id`·`role→role_cd` VARCHAR(20)·`pi_username→pi_usr_nm`·`pi_wallet_address→pi_wlt_adr_txt`·`display_name→dsp_nm`·`last_login_dtm→lst_lgn_dtm`·`rejoin_dtm→rjn_dtm`, 활성 UNIQUE `ux_sys_user_pi_usr_nm_actv`)과 001의 `REFERENCES sys_user (usr_id)`를 생성기가 **메모리에서 치환해** 읽는다(`renameSql`, 치환 규칙은 `02_modeler_pglite_check.mjs` 신규 DB 경로와 같다). 원본 000·001 파일은 수정하지 않는다 — 구현 단계에서 본문이 바뀌면 치환은 무해한 no-op 이 아니라 "형식 변경" 오류로 멈추므로 그때 `renameSql`을 지운다. 원본 그대로 읽으려면 `--no-rename`.
- 처리 순서:
  1. DDL에서 함수·트리거·DO 블록·INSERT·GRANT·COMMENT·CHECK를 걸러 낸다.
  2. `ALTER TABLE … ADD COLUMN`은 해당 `CREATE TABLE`의 공통 컬럼 6개 앞에 합친다.
  3. 결과를 `erd_import_sql`로 가져온다.
  4. 인벤토리로 논리명(코멘트)·기본값·색상·배치·메모를 덧입힌다.
  5. 결과 JSON을 인벤토리와 전수 대조한다.
- 대조에서 차이가 1건이라도 나오면 출력 파일을 쓰지 않고 종료한다(exit 2). 이때는 인벤토리를 갱신하거나 `--no-strict`로 강제 출력한다. 인벤토리에 없는 새 테이블은 "미분류" 영역에 놓이고, 새 컬럼의 논리명은 DDL 인라인 주석에서 가져온다.
- 대상 `.erd`가 VS Code에 열려 있어도 영향이 없다. 생성기는 임시 파일에 만든 뒤 복사한다. 복사 후에는 편집기에서 파일을 다시 열어야 바뀐 내용이 보인다.

## PNG 재촬영

`.erd`를 바꾼 뒤 이미지도 다시 만든다(헤드리스, 편집기 배율 100%).

1. 저장소 밖 임시 폴더에 HTML 한 장을 만든다 — `<script src="https://cdn.jsdelivr.net/npm/@dineug/erd-editor@3.10.0/dist/erd-editor.umd.js">` 를 불러오고, `<erd-editor>`(`width:100vw; height:100vh`)를 붙인 뒤 `.erd` 내용을 인라인 문자열로 넣어 `setInitialValue(...)` 를 호출한다(file:// 에서는 fetch 대신 인라인).
2. `agent-browser set viewport 3760 3420` → `agent-browser open file:///…/index.html` → `agent-browser wait 6000` → `agent-browser screenshot <png>` (첫 `open` 은 파이프 없이 실행 — 데몬 spawn 시 셸 대기).
3. 결과(3760×3420, 배율 100%)를 `sitemaps-data-model.png` 로 복사하고 `agent-browser close`.

## 포함 범위

- **테이블 14 · 컬럼 212 · FK 관계 17**(식별 1: `stat_site_dly.site_id → site_mst`, 나머지 16은 비식별). 인덱스 31개도 함께 들어 있다.
- 테이블마다 물리명과 논리명(테이블 코멘트)을 넣었다. 컬럼마다 논리명(코멘트)·타입·NULL 여부·PK·UNIQUE·기본값을 넣었다.
- 관계선의 자식 쪽은 0..N이다. 부모 쪽은 링(FK NULL 허용) 또는 대시(필수)로 표시된다. 대체키(UNIQUE `fee_plan.fee_plan_cd`)를 참조하는 관계 3개와 자기참조 1개도 포함된다.
- 주제영역(정본 §3)은 테이블 머리색과 영역 메모로 구분한다: 사용자 · 사이트 디렉터리 · 통계 · 결제(공용) · 요금·주문 · 시스템 설정. 영역 메모에는 테이블별 단계(공통 baseline / Phase 1 / Phase 2 초안)를 적었다.
- 메모 9개의 구성:
  - 문서 정보(모델명·버전 1.0 1차·2026-10-10·정본 경로·DA 최종 승인)
  - 표기·모델 메모
  - 주제영역 6개
  - `pi_pymnt` 자리표시("Phase 2 — 010_pi_pymnt 적용 후 fee_ord.pymnt_id FK 추가(키 타입 TBD)")

## 한계

- `pi_pymnt`는 아직 DDL이 없어 테이블이 아닌 메모로만 표시했다. `fee_ord.pymnt_id`는 현재 FK가 없는 TEXT다.
- 다음 항목은 ERD에 표현되지 않는다. 원천 DDL을 참조한다.
  - CHECK 제약·트리거·함수·시드 INSERT
  - 부분 인덱스의 `WHERE` 조건(활성 행 한정 UNIQUE)
  - 식 인덱스 `ux_promo_fee_cfg_sngl`
  - GIN trigram 인덱스(001의 DO 블록 안에 있음)
- 논리 참조(`sys_cfg_chg_hist` 다형 참조)와 감사 컬럼(`chgr_id`·`regr_id`·`modr_id`, FK 없음)은 관계선 대신 메모로 설명한다.
- 정본 §4-2의 세부 카디널리티(사이트당 이미지 0..4, 동시 ACTIVE 제재 ≤ 1 등)는 관계선에서 0..N으로 단순화했다. 세부 값은 메모에 적었다.
- 02 DDL은 초안이다(운영 적용 금지). DDL이 확정·변경되면 인벤토리를 맞춘 뒤 생성기를 다시 실행한다.
- Erwin·DA#의 네이티브 형식(.erwin·.da#)은 아니다. 필요하면 편집기에서 SQL(DDL)로 내보낸 뒤 해당 도구의 리버스 엔지니어링으로 가져온다.
