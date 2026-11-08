-- 데이터 교정: 매장 소속(오프라인) 상품인데 TRADING으로 잘못 들어간 주문을 ORDERED로.
-- 원인: markEscrow의 오프라인 판정이 PostgREST 중첩 응답 배열 형태에 취약했음(코드 동시 수정).
-- 주문이 들어온 직후는 '주문중(ORDERED)'이어야 하며 거래중(TRADING)은 직거래 전용 상태.

UPDATE public.mps_order o
SET order_st_cd = 'ORDERED',
    modr_id = 'SYSTEM',
    mod_dtm = CURRENT_TIMESTAMP
FROM public.mps_item i
WHERE o.item_id = i.item_id
  AND i.shop_id IS NOT NULL
  AND o.order_st_cd = 'TRADING'
  AND o.del_yn = 'N';
