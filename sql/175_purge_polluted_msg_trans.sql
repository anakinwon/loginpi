-- DA-APPROVED: msg_trans 오염 번역 캐시 논리삭제 (DML only — PyTranslate™ 국가파생 locale 근본수정, 2026-07-10)
--
-- 원인: 채팅 번역 프롬프트가 locale_cd(국가 파생 코드)를 raw로 엔진에 전달
--       → ye(예멘→아랍어)·er(에리트레아→영어)는 언어 특정 실패로 "원문 그대로" 캐시,
--         bn(브루나이→말레이어)·mt(몰타→영어) 등은 벵골어·몰타어로 "오역" 캐시.
--       캐시 우선 조회 구조라 코드 수정 후에도 오염 행이 영구 재사용됨 → 논리삭제로 재번역 유도.
-- 대상: 해석 언어(scripts/i18n-lang-map.mjs 단일소스) ≠ locale base 코드인 151개 locale.
--       표준 언어코드 locale(ko·en·ja·zh·fr·tr 등 뜻이 일치)은 캐시 유효 → 보존.
-- 복구: 논리삭제 행은 재번역 시 upsert가 del_yn='N'으로 부활 (chat-translate-dedup.ts)
-- 물리 DELETE 금지 원칙 준수 (DA 표준 — 논리삭제)

UPDATE public.msg_trans
   SET del_yn  = 'Y',
       del_dtm = CURRENT_TIMESTAMP,
       modr_id = 'ADMIN',
       mod_dtm = CURRENT_TIMESTAMP
 WHERE del_yn = 'N'
   AND locale_cd IN (
     'ad','ae','am','ao','ar-AR','at','au','ba','bb','bd','be','bf','bh','bi','bj',
     'bn','bo','br','bs','bt','bw','by','bz','ca','cd','cf','cg','ch','cl','cm',
     'co','cr','cu','cv','cy','cz','dj','dk','do','dz','ec','ee','eg','er','et',
     'fj','fm','ga','gb','ge','gh','gm','gn','gq','gr','gt','gw','gy','hn','ht',
     'ie','il','iq','ir','jm','jo','ke','kg','kh','ki','km','kn','kw','kz','la',
     'lb','lc','li','lk','lr','ls','lu','ly','ma','mc','md','me','mg','mh','ml',
     'mm','mr','mt','mu','mv','mw','mx','mz','na','ne','ng','ni','np','nr','nz',
     'om','pa','pe','pg','pk','pw','py','qa','rs','rw','sa','sb','sc','sd','se',
     'sg','si','sl','sm','sn','sr','ss','st','sv','sy','td','tg','tj','tl','tm',
     'tn','to','tt','tv','tw','tz','ua','ug','uy','vc','ve','vu','ws','ye','zm','zw'
   );

-- 검증: 잔존 활성 캐시는 표준 언어코드 locale만 남아야 함
-- SELECT locale_cd, count(*) FROM public.msg_trans WHERE del_yn='N' GROUP BY locale_cd ORDER BY locale_cd;
