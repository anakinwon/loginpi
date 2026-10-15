# 설계서 조립 — python assemble.py  (잡 디렉토리에서 실행)
# parts/*.md(리더 작성) + 팀원 산출물(02 모델·01 신청서·04 이행)의 지정 절을 순서대로 이어 붙여
# docs/da/references/메타시스템(METAPI)_구축_설계서.md 를 만든다. 팀원 파일은 그대로 인용(절 번호만 재부여)
import re
from pathlib import Path

J = Path(__file__).resolve().parent
OUT = J.parents[1] / 'references' / '메타시스템(METAPI)_구축_설계서.md'

def read(p): return (J / p).read_text(encoding='utf-8')

def section(text, start_pat, end_pat=None, shift=0):
    """start_pat(정규식) 제목 줄부터 end_pat 제목 줄 직전까지. shift 만큼 '#' 깊이를 더한다."""
    lines = text.splitlines()
    s = next(i for i, l in enumerate(lines) if re.match(start_pat, l))
    e = len(lines)
    if end_pat:
        e = next((i for i in range(s + 1, len(lines)) if re.match(end_pat, lines[i])), len(lines))
    body = lines[s:e]
    if shift:
        body = [('#' * shift + l) if re.match(r'^#{1,6} ', l) else l for l in body]
    return '\n'.join(body).rstrip() + '\n'

model = read('02_modeler_model.md')
dic = read('01_standards_dictionary.md')
mig = read('04_migration_plan.md')
ddl = read('02_modeler_ddl.sql')

p4 = ['## 4. 데이터 모델\n',
      '> 정본 산출물 : `02_modeler_model.md`(da-modeler) · `01_standards_dictionary.md`(da-standards) · `04_migration_plan.md`·`04_migration_ddl.sql`(da-migration) · 게이트 `03_quality_gate.md`(da-quality). 아래는 그 절을 그대로 옮긴 것이다(제목만 4-x 로 재부여). **본문 안의 `§n` 참조는 각 원 파일의 절 번호**이며 이 설계서의 절 번호가 아니다(예 02 의 §6-1 = 4-7-5-1, 04 의 §11 = 이관 계획서 §11). 이관 요약(4-8)의 식별자 S0-x·M1~M4·M3-opt·V1~V7·C2a·롤백 R1/R2 는 `04_migration_plan.md` §1·§3~§5·§8~§10 에 정의돼 있고, 롤백 R1/R2 는 명명 규칙 R1~R10 과 무관한 04 파일 안의 번호다.\n',
      section(model, r'^## 0\. 집계', r'^## 1\. ', 1).replace('### 0. 집계', '### 4-0. 집계'),
      section(model, r'^## 1\. 주제영역', r'^## 2\. ', 1).replace('### 1. 주제영역 정의서', '### 4-1. 주제영역 정의서'),
      section(model, r'^## 2\. 개념 ERD', r'^## 3\. ', 1).replace('### 2. 개념 ERD', '### 4-2. 개념 ERD'),
      section(model, r'^## 3\. 논리 엔터티', r'^## 4\. ', 1).replace('### 3. 논리 엔터티·속성 정의서', '### 4-3. 논리 엔터티·속성 정의서'),
      section(model, r'^## 4\. 물리 테이블', r'^## 5\. ', 1).replace('### 4. 물리 테이블 정의서', '### 4-4. 물리 테이블 정의서').replace('#### 4-1.', '#### 4-4-1.').replace('#### 4-2.', '#### 4-4-2.'),
      '### 4-5. DDL 초안 (`02_modeler_ddl.sql` 전문 — DA 승인 전제, `sql/` 미적용)\n\n```sql\n' + ddl.rstrip() + '\n```\n',
      section(dic, r'^## 0\. 적용 원칙', r'^## 4\. ', 1).replace('### 0. 적용 원칙', '### 4-6. 신규 표준단어·도메인·접두사 신청서 — 적용 원칙').replace('### 1. 단어 신청서', '#### 4-6-1. 단어 신청서').replace('#### 1-1.', '##### 4-6-1-1.').replace('#### 1-2.', '##### 4-6-1-2.').replace('#### 1-3.', '##### 4-6-1-3.').replace('#### 1-4.', '##### 4-6-1-4.').replace('### 2. 도메인 신청서', '#### 4-6-2. 도메인 신청서').replace('### 3. 접두사 신청', '#### 4-6-3. 접두사 신청'),
      section(dic, r'^## 5\. 리더 판정', r'^## 7\. ', 1).replace('### 5. 리더 판정 결과', '#### 4-6-4. 리더 판정 결과').replace('### 6. 승계 객체', '#### 4-6-5. 승계 객체'),
      section(model, r'^## 5\. 자가 점검', r'^## 6\. ', 1).replace('### 5. 자가 점검', '### 4-7. 자가 점검 (04 §7.3 체크리스트·식별자·정규화·Hook)').replace('#### 5-', '#### 4-7-'),
      section(model, r'^## 6\. 명명 치환', r'^## 7\. ', 1).replace('### 6. 명명 치환', '#### 4-7-5. 명명 치환').replace('#### 6-', '##### 4-7-5-'),
      '### 4-8. 표준사전 5테이블 이관 계획 (`04_migration_plan.md` 요약 — 전문은 잡 디렉토리, 절 번호는 원 파일 것을 유지하므로 결번은 생략한 절)\n',
      section(mig, r'^## 0\. 요약', r'^## 1\. ', 1).replace('### 0. 요약', '#### 4-8-0. 요약'),
      section(mig, r'^## 2\. 원천', r'^## 3\. ', 1).replace('### 2. 원천', '#### 4-8-2. 원천').replace('#### 2-', '##### 4-8-2-'),
      section(mig, r'^## 6\. cafe\.pi', r'^## 7\. ', 1).replace('### 6. cafe.pi', '#### 4-8-6. cafe.pi').replace('#### 6-', '##### 4-8-6-'),
      section(mig, r'^## 8\. 컷오버', r'^## 9\. ', 1).replace('### 8. 컷오버', '#### 4-8-8. 컷오버'),
      section(mig, r'^## 10\. 롤백', r'^## 11\. ', 1).replace('### 10. 롤백', '#### 4-8-10. 롤백'),
      section(mig, r'^## 12\. 리스크', r'^## 13\. ', 1).replace('### 12. 리스크 · 확인중', '#### 4-8-12. 리스크 · 확인중'),
      ]
gate = (J / '03_quality_gate.md')
if gate.exists():
    g = gate.read_text(encoding='utf-8')
    head = '\n'.join(l for l in g.splitlines()[:10] if l.strip() and not l.startswith('# '))
    p4.append('### 4-9. 품질 게이트 판정 (`03_quality_gate.md` 판정·요약·위반 목록 발췌 — 집계·PGlite·체크리스트 전문은 잡 디렉토리, 결번 = 생략한 절)\n\n' + head.strip().replace('`01_standards_dictionary.md` · `01_standards_dictionary.md`', '`01_standards_dictionary.md`') + '\n\n'
              + section(g, r'^## 1\. 판정 요약', r'^## 2\. ', 2).replace('#### 1. 판정 요약', '#### 4-9-1. 판정 요약')
              + '\n' + section(g, r'^## 3\. 위반 목록', r'^## 4\. ', 2).replace('#### 3. 위반 목록', '#### 4-9-3. 위반 목록').replace('##### 3-1.', '##### 4-9-3-1.'))

parts = ['p0_head.md', 'p1_ref.md', 'p2_arch.md', 'p3_screens.md']
doc = [read('parts/' + p) for p in parts] + p4 + [read('parts/' + p) for p in ['p5_api.md', 'p6_batch.md', 'p7_perf_ai.md', 'p8_p9_p10.md', 'pA_appendix.md']]
OUT.write_text('\n'.join(doc), encoding='utf-8')
txt = OUT.read_text(encoding='utf-8')
print('written', OUT.name, len(txt.splitlines()), 'lines', len(txt), 'chars')
