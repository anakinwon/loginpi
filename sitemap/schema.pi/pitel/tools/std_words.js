// 표준단어 원장(손으로 관리하는 정본) — std_build.js 가 읽어 words.json·terms.json 생성·개념 모델 phyNm 재계산
// 형식 : 논리명|물리약어|영문 풀네임|정의|분류  (분류 : E_X = 엔터티 분류어·테이블 접미어 _X, A:<대표도메인> = 속성 분류어)
// 약어 결정 원칙은 docs/03_standards.md 2절 참조(같은 약어 두 단어 금지·합성어 '_' 없음·행안부 공통표준 관행 우선)
module.exports = `
기본|BAS|Base|엔터티의 현재 상태를 1행으로 관리하는 기본 집합, 속성에서는 기초·기본값|E_M
상세|DTL|Detail|상위 엔터티 1건을 항목·서브타입 단위로 나눈 상세 집합|E_D
내역|DTLS|Details|업무 행위가 발생할 때마다 쌓이는 행위 기록 집합|E_L
이력|HIST|History|상태·값 변경 전후를 유효 기간과 함께 보존하는 집합|E_H
정보|INFO|Information|특정 대상의 부가 정보 묶음|E_I
로그|LOG|Log|시스템이 남기는 기술 기록|E_G
인터페이스|IF|Interface|외부 시스템과 주고받는 연계 자료|E_F
집계|AGG|Aggregation|원천 자료를 기간·기준별로 합산한 가공 결과|E_T
통계|STATS|Statistics|분석용 통계 가공 결과|E_S
백업|BKUP|Backup|원본 보존용 복사본|E_B
관계|REL|Relation|두 대상 간의 관계, 엔터티에서는 N:M 해소 관계 집합|E_R
코드|CD|Code|업무 분류 값을 식별하는 부호, 엔터티에서는 기준 코드 집합|E_C A:코드
번호|NO|Number|대상을 식별하거나 외부에서 부여받은 번호|A:번호
명|NM|Name|대상을 부르는 이름|A:명
일시|DTM|Date Time|연월일 시분초까지의 시점|A:일시
일자|DT|Date|연월일(YYYYMMDD)|A:일자
년월|YM|Year Month|연월(YYYYMM)|A:년월
일|DD|Day|월 중의 일(DD, 01~31)|A:일
여부|YN|Yes or No|해당 여부(Y/N)|A:여부
금액|AMT|Amount|원화 금액(원 단위 정수)|A:금액
수|CNT|Count|개수·인원 등 셀 수 있는 수|A:수
건수|NOCS|Number of Cases|처리·발생 건의 수|A:건수
횟수|NMTM|Number of Times|반복 발생한 횟수|A:수
개월수|MCNT|Month Count|기간의 개월 수|A:수
일수|DCNT|Day Count|기간의 일 수|A:일수
초수|SCNT|Second Count|시간의 초 수|A:수
분수|MNTCNT|Minute Count|시간의 분 수(음성 제공량 등)|A:수
회차|TMS|Times|분할·반복 거래의 차례 번호|A:회차
량|QTY|Quantity|사용·과금 대상 물리량(초·바이트·건)|A:수량
용량|CPCT|Capacity|제공·저장 가능한 크기(바이트)|A:수량
율|RT|Rate|비율(백분율, 소수 2자리)|A:율
세율|TXRT|Tax Rate|과세표준에 적용하는 세금 비율|A:율
이자율|INTRT|Interest Rate|할부 등에 적용하는 연 이자율|A:율
내용|CN|Contents|자유 서술 내용|A:내용
값|VL|Value|측정·설정·암호화된 값|A:값
일련번호|SN|Serial Number|부모 안에서 등록 차례로 매기는 번호 또는 기기 일련번호|A:일련번호
순번|SEQ|Sequence|부모 안의 처리·표시 순서|A:순번
우선순위|PRRT|Priority|여러 대상 중 먼저 처리하는 순서|A:순번
세액|TXAMT|Tax Amount|과세표준에 세율을 곱한 세금 금액|A:금액
잔액|BAL|Balance|사용·정리하고 남은 금액|A:금액
가격|PRC|Price|재화의 판매·출고 가격|A:금액
원금|PRNC|Principal|이자를 제외한 원래 금액|A:금액
지원금|SUBSD|Subsidy|단말 구매 시 지원하는 금액(공시·추가 지원금)|A:금액
공급가액|SPLYAMT|Supply Amount|부가가치세를 제외한 공급 대가 금액|A:금액
주소|ADDR|Address|우편·전자 주소|A:주소
상세주소|DADDR|Detail Address|도로명주소 뒤의 동·호 등 상세 주소|A:주소
전화번호|TELNO|Telephone Number|전화번호(숫자 문자열)|A:전화번호
우편번호|ZIP|Zip Code|우편번호 5자리|A:우편번호
생년월일|BRDT|Birth Date|태어난 연월일|A:일자
사업자등록번호|BRNO|Business Registration Number|국세청 사업자등록번호 10자리|A:번호
법인등록번호|CRNO|Corporate Registration Number|법원 법인등록번호 13자리|A:번호
유형|TY|Type|값이 4개 이상이거나 늘어날 수 있는 분류(공통코드 유형코드)|
구분|SE|Section|값이 2~3개이고 절대 늘지 않는 분류(공통코드 구분코드)|
종류|KND|Kind|물리적 종류 분류(공통코드 종류코드)|
상태|STTS|Status|대상의 생애주기 상태|
가능|PSBL|Possible|할 수 있음|
가맹점|MRCH|Merchant|결제·소액결제 가맹점|
가산|ADTN|Addition|기준 금액에 더함|
가산금|ADCHG|Additional Charge|연체 시 부과하는 연체가산금|
가상계좌|VACCT|Virtual Account|수납용으로 발급한 가상 입금 계좌|
가입|SBSC|Subscription|이동통신 서비스 가입|
가족|FMLY|Family|가족|
감면|RDCT|Reduction|부과 금액을 줄여 줌|
갱신|RNW|Renewal|계약 기간 연장|
개설|OPN|Opening|점포·계좌를 엶|
개인|INDV|Individual|자연인 개인|
개인정보|PRVC|Privacy|개인을 알아볼 수 있는 정보|
개통|OPNG|Activation|회선 개통(서비스 사용 시작)|
거래|TRD|Trade|사업자 간 거래|
거래처|CNPT|Counterparty|거래 상대방|
거절|RFSL|Refusal|요청을 받아들이지 않음(번호이동 거절 등)|
건물|BLDG|Building|건물|
검증|VRFC|Verification|유효성 확인|
결과|RSLT|Result|처리 결과|
결합|CMBN|Combination|여러 회선·상품을 묶은 결합|
경과|ELPS|Elapse|기준 시점부터 지난 정도|
계산|CALC|Calculation|요금·세금 등을 계산함|
계약|CTRT|Contract|계약|
계정|ACNT|Account|청구 단위 계정(청구계정)|
계좌|ACCT|Bank Account|금융기관 예금 계좌|
고객|CUST|Customer|통신 서비스 명의 고객|
공급|SPLY|Supply|재화·용역의 공급|
공시|PBANC|Public Announcement|약관·홈페이지 공시|
과금|RAT|Rating|사용량을 요금 대상으로 변환하는 과금(Rating)|
과세|TXTN|Taxation|부가가치세 과세|
과세표준|TXSTD|Tax Base|세액 계산의 기준 금액|
과오납|OVPAY|Overpayment|이중·초과·착오 납부|
관리|MGMT|Management|관리|
국|EXCH|Exchange|전화번호 국번(교환국)|
국가|NATN|Nation|국가|
국세청|NTS|National Tax Service|국세청|
규모|SCL|Scale|기업 규모|
금융|FNNC|Finance|금융|
기간|PRD|Period|시작부터 끝까지의 기간|
기관|INST|Institution|기관|
기본제공|BSCPRVD|Basic Provision|요금제가 기본으로 제공하는 음성·문자·데이터 제공량|
기한|TMLMT|Time Limit|납부 등의 기한|
기준|STD|Standard|판단·산정의 기준|
납부|PAY|Payment|요금을 냄|
납부자|PYR|Payer|요금을 실제로 내는 사람·법인|
내외국인|DMFRGN|Domestic Foreign|내국인·외국인 구분|
누적|ACML|Accumulation|기간 동안 더해 온 합계(누계 포함)|
단계|STEP|Step|진행 단계|
단말|EQP|Equipment|이동통신 단말기|
단위|UNIT|Unit|측정 단위|
담당|TKCG|Take Charge|업무 담당|
당월|THMM|This Month|해당 청구 월|
대리점|AGNC|Agency|통신사와 위탁 계약한 대리점|
대상|TRGT|Target|적용 대상|
대손|BDDT|Bad Debt|회수 불능 채권의 손실 처리|
대표|RPRS|Representative|여럿 중 대표|
대표자|RPRSV|Representative Person|법인·사업자의 대표자|
대행|AGT|Agent|업무를 대신 수행함|
데이터|DATA|Data|데이터 통신|
도로|ROAD|Road|도로|
도서|ISLND|Island|섬 지역|
도용|THFT|Theft|명의 도용|
독촉|DUN|Dunning|미납 요금 납부 독촉|
동의|AGRE|Agreement|개인정보·약관 동의|
등급|GRD|Grade|등급|
등록|REG|Registration|최초 등록|
레코드|RCRD|Record|원시 과금 레코드(CDR)|
로밍|ROAM|Roaming|국제 로밍|
마감|DDLN|Deadline|작업·기간의 마감|
만료|EXPRY|Expiry|기간 만료|
망|NTWK|Network|이동통신망|
매입|PRCHS|Purchase|매입(세금계산서 수취)|
매체|MDM|Medium|발송 매체|
매출|SLS|Sales|매출(세금계산서 발행)|
면세|TXEMP|Tax Exemption|부가가치세 면세|
명의|NMNE|Nominee|가입 명의|
모델|MDL|Model|단말 모델|
무료|FREE|Free|무료|
무제한|UNLMT|Unlimited|제공량 제한 없음|
문자|SMS|Short Message|문자 메시지|
미납|UNPD|Unpaid|납부기한까지 내지 않은 요금|
미배분|UNALLC|Unallocated|청구 항목에 아직 배분하지 않음|
바이트|BYTE|Byte|데이터 크기 단위|
반려|RJCT|Reject|신청을 되돌려 보냄|
반송|RTRN|Return|우편물 반송|
반영|RFLT|Reflection|다른 대상에 결과를 반영|
발급|ISSU|Issuance|번호·계좌 등을 내어 줌|
발생|OCRN|Occurrence|사건 발생|
발송|SNDNG|Sending|우편·문자 발송|
발신|CLG|Calling|통화를 건 쪽(발신)|
발행|PBLCN|Publication|청구서·세금계산서 발행|
방법|MTHD|Method|수행 방법|
방식|SCHM|Scheme|계산·배분 방식|
방향|DRCT|Direction|지급·수취 방향|
배분|ALLC|Allocation|금액을 항목별로 나눠 배정|
버전|VER|Version|판(版)|
번호이동|MNP|Mobile Number Portability|번호를 유지한 채 통신사를 옮김|
법인|CORP|Corporation|법인|
법정대리인|LGLRP|Legal Representative|미성년자 등의 법정대리인|
변경|CHG|Change|값·상태 변경|
보증|GRNT|Guarantee|계약 이행 보증|
복지|WLFR|Welfare|요금 감면 복지 대상|
본인|SELF|Self|명의자 본인|
부가가치세|VAT|Value Added Tax|부가가치세(부가세 포함)|
부가서비스|ADSVC|Additional Service|요금제 외 선택 부가서비스|
부과|IMPS|Imposition|금액을 매김|
분류|CLSF|Classification|분류|
분할|DIV|Division|나눔(분할납부)|
불이행|NFLFL|Non Fulfillment|약정 불이행|
사|CO|Company|회사(카드사·제공사·제조사·추심사·대행사)|
사업자|BZMN|Business Operator|사업자(로밍·번호이동 사업자 포함)|
사용|USE|Use|사용|
사유|RSN|Reason|사유|
사전승낙|PRAPRV|Prior Approval|판매점 사전승낙제(KAIT)|
산간|MNTN|Mountain|산간 지역|
산정|ASMT|Assessment|기준에 따라 값을 정함|
상각|DPRC|Write Off|채권 상각|
상계|OFST|Offset|채권·채무 상계|
상위|UP|Upper|상위 계층|
상품|PROD|Product|판매 상품|
상한|UPLMT|Upper Limit|최대 한도|
상호접속|INTCN|Interconnection|사업자 간 망 상호접속|
서비스|SVC|Service|통신 서비스|
선납|PRPAY|Prepayment|미리 낸 요금|
선택|CHC|Choice|선택(선택약정)|
설립|FNDN|Foundation|법인 설립|
성별|GNDR|Gender|성별|
성인|ADLT|Adult|성인 대상|
세금|TAX|Tax|세금|
세금계산서|TXINV|Tax Invoice|부가가치세법상 세금계산서|
세무|TXAF|Tax Affairs|세무|
센터|CTR|Center|센터|
소멸|EXTSH|Extinction|권리 소멸|
소진|EXHST|Exhaustion|제공량·잔액을 다 씀|
속도|SPD|Speed|전송 속도(Kbps)|
손금|LSEXP|Deductible Expense|세무상 손금|
수납|RCV|Receipt of Payment|요금을 받아 들임(수납)|
수령|RCPT|Receipt|물건·서류를 받음|
수령인|RCPN|Recipient|우편·환불을 받는 사람|
수신|RCPTN|Reception|메시지·결과를 받음|
수익|PRFT|Profit|수익|
수정|MDFCN|Modification|발행 후 수정|
수집|CLCT|Collection|자료 수집|
승계|SCSN|Succession|권리·의무 승계|
승인|APRV|Approval|승인|
시간|HR|Hour Time|사용 시간|
시작|BGNG|Beginning|시작|
시점|PNT|Point|특정 시점|
시효|PRSCR|Prescription|소멸시효|
신고|DCLR|Declaration|행정기관·회사에 신고|
신분증|IDCD|ID Card|신분증|
신청|APLY|Application|신청|
신청인|APLCNT|Applicant|신청한 사람|
실명|RLNM|Real Name|실명|
암호화|ENCPT|Encryption|암호화|
약관|TRMS|Terms|이용약관|
약정|AGRMT|Commitment|기간 약정|
업무|TASK|Task|업무|
업종|TPBIZ|Type of Business|업종(KSIC)|
여신|CRDT|Credit|여신(외상 한도)|
연계|LNKG|Linkage|다른 상품·업무와 연계|
연동|LNK|Link|망·시스템 연동|
연락처|CNTC|Contact|연락처|
연체|OVDU|Overdue|납부기한 경과|
영문|ENG|English|영문 표기|
예고|PRNTC|Prior Notice|사전 예고|
예금주|DPSOWN|Account Holder|예금 계좌 명의인|
예정|SCHD|Schedule|예정|
오류|ERR|Error|오류|
온라인|ONLN|Online|온라인|
완납|CMPLPAY|Complete Payment|남은 금액 전부 납부|
완료|CMPTN|Completion|완료|
외국인|FRGNR|Foreigner|외국인|
요금|CHRG|Charge|통신 요금|
요금제|RTPLN|Rate Plan|기본 요금 상품(요금제)|
요소|ELMT|Element|망 구성 요소|
요청|REQ|Request|요청|
운영|OPER|Operation|운영|
원|ORGN|Original|원래의 것(원 통신사·원 세금계산서)|
원시|RAW|Raw|가공 전 원시|
원인|CAUS|Cause|원인|
원천|SRC|Source|발생 원천|
월|MM|Month|월|
위약금|PNLT|Penalty|약정 위반 위약금|
위임|DLGT|Delegation|업무 위임|
유선|WIRE|Wireline|유선 통신|
유심|USIM|USIM|가입자 식별 모듈(USIM)|
유효|VLD|Valid|유효|
은행|BANK|Bank|은행|
음성|VOICE|Voice|음성 통화|
이관|TRNSF|Transfer|다른 조직·기관으로 넘김|
이동|MOB|Mobile|이동통신(MCC·MNC)|
이메일|EML|Email|전자우편|
이용정지|SUSP|Suspension|미납·요청에 따른 이용 정지|
이월|CYOV|Carry Over|다음 기간으로 넘김|
이자|INTR|Interest|이자|
이전|BFR|Before|직전의 것|
이체|TRSF|Transfer|계좌 이체|
인정|RCGTN|Recognition|인정|
인증|CRTF|Certification|인증|
일할|DYPRT|Daily Proration|일 단위 비례 계산|
입금|DPST|Deposit|입금|
입금자|DPSTR|Depositor|입금한 사람|
자|PRSN|Person|사람(동의자·명의자)|
자급제|SLFSPLY|Self Supply|통신사 유통 없이 산 단말|
자동|ATMT|Automatic|자동|
자동이체|ATRF|Auto Transfer|계좌 자동이체|
작성|WRT|Writing|작성|
작업|JOB|Job|배치 작업|
재|RE|Re|다시 함|
적요|SMRY|Summary|거래 적요|
적용|APLCN|Application|기준·값 적용|
전자|ELCTR|Electronic|전자|
전입|MVIN|Move In|번호이동 전입|
전표|SLIP|Slip|회계 전표|
전환|CNVR|Conversion|상태 전환|
접수|ACPT|Acceptance|신청 접수|
정렬|SORT|Sort|정렬|
정산|STLM|Settlement|사업자 간·파트너 정산|
정액|FXAMT|Fixed Amount|정해진 금액|
정책|PLCY|Policy|정책|
제공|PRVD|Provision|제공|
제목|TTL|Title|제목|
제조|MNFCT|Manufacture|제조|
제한|RSTR|Restriction|제한|
조건|CND|Condition|조건|
조정|ADJ|Adjustment|청구·미납 금액 조정|
조직|ORG|Organization|조직|
종료|END|End|종료|
종업원|EMP|Employee|종업원|
주기|CYCL|Cycle|반복 주기|
중복|DUP|Duplication|중복|
증빙|EVDC|Evidence|증빙|
지|PLC|Place|장소(청구지)|
지급|GIVE|Payment Out|지급|
지역|RGN|Region|지역|
지원|SPRT|Support|지원|
지정|DSGN|Designation|지정|
직권해지|EXOFTRMN|Ex Officio Termination|사업자 직권 해지|
직영|DRMG|Direct Management|직영|
차감|DDCT|Deduction|차감|
착신|CLD|Called|통화를 받은 쪽(착신)|
채권|RCVB|Receivable|받을 채권|
채널|CHNL|Channel|접점 채널|
처리|PRCS|Process|처리|
철회|WTHDR|Withdrawal|철회|
청구|BILL|Billing|요금 청구|
청구서|INVC|Invoice|고객에게 보내는 요금 청구서|
체류|STAY|Stay|외국인 체류|
초과|EXCS|Excess|제공량 초과|
총|TOT|Total|전체 합계|
최대|MAX|Maximum|최대|
최소|MIN|Minimum|최소|
최종|LAST|Last|마지막|
최초|FRST|First|처음|
추가|ADD|Addition|추가|
추심|COLL|Debt Collection|채권 추심|
출고|SHPM|Shipment|단말 출고|
출금|WDRW|Withdrawal|계좌 출금|
출력|OUTPT|Output|출력|
출시|LNCH|Launch|출시|
취소|CNCL|Cancel|취소|
카드|CARD|Card|신용·체크 카드|
콘텐츠|CNTS|Contents|디지털 콘텐츠|
통신사업자|CARR|Carrier|기간통신사업자|
통신판매업|MLORD|Mail Order Business|통신판매업|
통합|INTGR|Integration|통합|
통화|CRNCY|Currency|통화(화폐)|
파기|DSTR|Destruction|개인정보 파기|
파일|FILE|File|파일|
파트너|PRTNR|Partner|유통·제휴·사업자 파트너|
판매|SALE|Sale|판매|
판매점|SHOP|Shop|대리점 산하 판매점|
포함|INCL|Inclusion|포함|
폐쇄|CLSR|Closure|폐쇄|
품목|PRDLST|Product List|세금계산서 품목|
필요|NEED|Need|필요|
한도|LMT|Limit|금액 한도|
할당|ASGN|Assignment|번호 할당|
할부|INSTL|Installment|할부|
할인|DSCNT|Discount|할인|
합계|SUM|Sum|합계|
합병|MRGR|Merger|합병|
항목|ITM|Item|요금·동의 항목|
해제|RLS|Release|정지·제한 해제|
해지|TRMN|Termination|계약 해지|
협정|ACRD|Accord|사업자 간 협정|
형태|FORM|Form|형태|
호스트|HOST|Host|호스트(MVNO 모 사업자)|
확인|IDNTF|Identification|확인|
확정|CFMTN|Confirmation|확정|
환불|RFND|Refund|환불|
회계|ACNTG|Accounting|회계|
회선|LINE|Line|가입 회선|
회수|RTRVL|Retrieval|채권·번호·계좌 회수|
후|AFTR|After|이후|
휴대|MBL|Mobile Phone|휴대전화|
휴면|DRMT|Dormant|휴면|
희망|HOPE|Hope|희망|
eSIM|ESIM|Embedded SIM|내장형 가입자 식별 모듈|
IMSI|IMSI|International Mobile Subscriber Identity|국제 이동 가입자 식별번호|
IMEI|IMEI|International Mobile Equipment Identity|국제 이동 단말 식별번호|
NFC|NFC|Near Field Communication|근거리 무선 통신|
TADIG|TADIG|Transferred Account Data Interchange Group|GSMA 로밍 사업자 식별 코드|
잔여|RMND|Remainder|아직 남아 있음|
사업장|BPLC|Business Place|사업을 하는 장소|
장|HD|Head|조직의 장|
비용|CST|Cost|비용|
담보|CLTRL|Collateral|채권 담보|
전속|EXCL|Exclusive|한 통신사 전속|
스캐너|SCNR|Scanner|신분증 스캐너|
보유|HOLD|Holding|가지고 있음|
부가통신사업|VASB|Value Added Service Business|전기통신사업법상 부가통신사업|
수수료|FEE|Fee|업무 대가 수수료|
휴대폰|HP|Hand Phone|휴대전화 단말(휴대폰 결제)|
결제|PYMT|Payment Settlement|대금 결제(휴대폰 소액결제)|
가맹|AFLT|Affiliation|가맹 계약|
식별|IDFC|Identification Code|대상을 구별하는 식별|
청산|CLRH|Clearing|사업자 간 데이터·대금 청산|
공제|DDTN|Deduction|지급액에서 공제|
전송|TRNM|Transmission|외부 기관으로 전송|
제휴|ALNC|Alliance|제휴 관계|
구성|CMPS|Composition|여러 요소가 모여 하나를 이룸(패키지·결합 구성)|
배타|EXCLN|Exclusion|함께 있을 수 없도록 서로 밀어냄(동시 가입 불가)|
요율|TRF|Tariff|사용 단위당 요금 비율(Rating 기준표)|
권역|ZONE|Zone|요율·로밍을 같게 적용하는 지역 묶음|
시간대|TMBND|Time Band|하루 중 요율을 달리 적용하는 시간 구간(합성어 — 시간+대)|
수단|MEANS|Means|어떤 일을 이루기 위한 방법·도구|
실패|FAIL|Failure|목적한 처리가 이루어지지 않음|
담당자|PIC|Person In Charge|업무를 맡은 사람(합성어 — 담당+자)|
부서|DEPT|Department|조직 안의 업무 단위|
직위|JBPS|Job Position|조직 안의 직급·직책|
본사|HQ|Headquarters|여러 사업장을 거느린 주된 사업장|
필수|ESNTL|Essential|반드시 있어야 함|
마케팅|MKT|Marketing|광고·판촉 활동|
거부|DENY|Denial|받아들이지 않겠다는 의사 표시(수신거부)|
멤버십|MBSP|Membership|고객 우대 회원 제도|
포인트|POINT|Point|멤버십 적립·사용 단위 점수|
상담|CNSL|Consultation|고객 문의에 응대하는 행위|
민원|CVLCPT|Civil Complaint|고객이 제기한 불만·이의 신청|
보상|CMPNS|Compensation|손해를 갚아 줌|
활성|ACTV|Active|현재 사용 중인 상태|
서류|DOC|Document|가입·변경 때 제출하는 신분증·위임장·증명서 등 문서|
제출|SBMSN|Submission|서류를 내어 접수시킴|
일시정지|PAUS|Temporary Pause|고객 요청에 따른 회선 일시 이용 중지(미납 이용정지와 다름) — 합성어, 일시(DTM)와 혼동 방지|
소액결제|MCPAY|Micro Payment|휴대폰 소액결제(통신과금서비스, 전자금융거래법) — 합성어|
이용|UTLZ|Utilization|콘텐츠·서비스를 이용함(행안부 공통표준 이용 UTLZ)|
반환|RTN|Return|지원금·할인 반환|
환율|EXRT|Exchange Rate|정산 통화 → 원화 환산 비율 — 속성 분류어(대표도메인 환율)|A:환율
생성|CRT|Creation|자료가 만들어짐|
TAP|TAP|Transferred Account Procedure|GSMA TAP3 로밍 사용기록 교환 절차·파일|
정상|NRML|Normal|오류 없이 처리된 정상 상태|
지로|GIRO|Giro|금융결제원 지로 — 청구서 장표로 금융기관 창구·전자납부하는 수납 수단|
영수증|RCIPT|Receipt|돈을 받았음을 증명하는 문서(수령 RCPT 와 구분)|
현금|CASH|Cash|현금 — 현금영수증(조세특례제한법) 표기에 쓰임|
대사|RCNCL|Reconciliation|두 원장(자사·대행기관)의 건수·금액을 맞춰 보는 일|
미확인|UNIDNTF|Unidentified|입금 주체(청구계정)를 아직 확인하지 못함(합성어 — 미배분 UNALLC 와 같은 방식)|
매각|DSPSL|Disposal|채권을 대가를 받고 제3자에게 넘김|
약속|PRMS|Promise|정해진 날까지 하기로 한 다짐(납부 약속)|
유예|DFRM|Deferment|정지·독촉 등 조치를 일정 기간 미룸|
이행|FLFL|Fulfillment|약속·약정을 실제로 지킴|
신용정보|CRINFO|Credit Information|신용정보법상 신용정보(통신 채무 불이행 정보 포함) — 합성어, 여신 CRDT 와 약어 충돌 회피|
기산|RCKN|Reckoning|기간 계산의 시작점(소멸시효 기산)|
중단|INTRPT|Interruption|진행 중이던 기간·절차가 끊김(시효 중단)|
구간|SCTN|Section|값의 범위를 나눈 한 칸(경과일 구간)|
장려금|INCNTV|Incentive|유통망 판매 실적에 따라 주는 판매 장려금(단말기유통법 대상)|
환수|CLBK|Clawback|이미 지급한 수수료·장려금을 조건 미충족(조기 해지 등)으로 되돌려 받음|
재고|STCK|Stock|유통망이 보유한 판매 대기 단말·유심|
입고|WRHS|Warehousing|재고가 유통망 창고·매장에 들어옴|
유치|ATRCT|Attraction|판매 채널이 신규 가입을 끌어옴(유치 수수료 근거)|
이의|OBJC|Objection|정산 결과에 대한 상대방의 이의 제기|
`
