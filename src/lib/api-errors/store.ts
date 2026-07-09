// i18n 에러코드 카탈로그 — store 도메인 (값=한국어 폴백 메시지)
// PyShop™(매장·상품·주문·거래) + 이용후기(FBCK_) + 구독(SUBSCR_) 고유 에러.
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const STORE_ERRORS = {
  // 매장 인증 등록(claim) / 매장 CRUD
  STORE_LBS_CONSENT_REQUIRED: '위치기반서비스 동의가 필요합니다 (현장 위치 확인)',
  STORE_CLAIM_FIELDS_REQUIRED:
    '매장명·전화번호·대표자명·주소·이메일을 모두 입력해주세요',
  STORE_PLACE_ID_MISMATCH: 'place_id가 정확히 일치하지 않습니다 (대소문자 구분)',
  STORE_PLACE_NOT_FOUND: '구글에서 해당 매장을 찾을 수 없습니다',
  STORE_NO_PLACE_COORD: '구글에 매장 좌표가 없어 현장 인증할 수 없습니다',
  STORE_CLAIM_TOO_FAR:
    '매장에서 {m}m 떨어져 있습니다. 매장 {radius}m 이내에서 다시 시도해주세요.',
  STORE_NO_PLACE_PHONE: '구글에 전화번호가 없어 자동 인증할 수 없습니다',
  STORE_PHONE_MISMATCH: '입력한 전화번호가 구글에 등록된 매장 전화번호와 다릅니다',
  STORE_SHOP_ALREADY_MINE: '이미 내가 등록한 매장입니다',
  STORE_SHOP_ALREADY_CLAIMED: '이미 다른 사용자가 등록·인증한 매장입니다',
  STORE_SHOP_CLAIM_ONLY:
    '매장은 구글맵 인증 등록으로만 가능합니다. 지도에서 내 매장을 찾아 인증 등록해 주세요.',
  STORE_SHOP_NOT_FOUND_OR_FORBIDDEN: '매장을 찾을 수 없거나 권한이 없습니다',
  STORE_SHOP_NOT_OWNED: '본인 매장이 아니거나 존재하지 않습니다',
  STORE_SET_REP_FAILED: '처리 실패',
  STORE_SHOP_NOT_OWNED_OR_MISSING: '본인 매장이 아니거나 존재하지 않는 매장입니다',

  // 상품 CRUD
  STORE_ITEM_NOT_FOUND: '상품을 찾을 수 없습니다',
  STORE_ITEM_UPDATE_FORBIDDEN: '본인 상품만 수정할 수 있습니다',
  STORE_INVALID_STATUS: '유효하지 않은 상태입니다',
  STORE_QTY_BELOW_ORDERED: '등록수량은 누적 주문수량보다 작을 수 없습니다',
  STORE_ITEM_DELETE_FORBIDDEN: '상품이 없거나 삭제 권한이 없습니다',

  // 상품 이미지 업로드
  STORE_IMAGE_TOO_LARGE: '이미지 크기는 1MB 이하여야 합니다',
  STORE_IMAGE_TYPE_NOT_ALLOWED:
    '허용되지 않은 이미지 형식입니다 (JPEG/PNG/WebP/GIF)',

  // 주문 생성·배달 검증 (단건)
  STORE_DELIVERY_ADDR_REQUIRED: '배달 위치를 입력해주세요',
  STORE_DELIVERY_NOT_SUPPORTED: '이 매장은 배달을 지원하지 않습니다',
  STORE_OUT_OF_STOCK: '재고가 없거나 판매 중인 상품이 아닙니다',
  STORE_SELF_PURCHASE: '본인 상품은 구매할 수 없습니다',
  STORE_ORDER_NOT_FOUND: '주문을 찾을 수 없습니다',
  STORE_NOT_ALLOWED: '허용되지 않은 요청입니다',
  STORE_EMPTY_ORDER: '주문 항목이 없습니다',
  STORE_SHOP_NOT_FOUND: '매장을 찾을 수 없습니다',
  STORE_BAD_QTY: '수량이 올바르지 않습니다',
  STORE_ORDER_CREATE_FAILED: '주문 생성에 실패했습니다',

  // 주문 생성 (카트 — 문구가 단건과 달라 별도 코드)
  STORE_CART_OUT_OF_STOCK: '재고가 부족하거나 판매 중이 아닌 상품이 있습니다',
  STORE_SELF_PURCHASE_SHOP: '본인 매장 상품은 구매할 수 없습니다',
  STORE_EMPTY_CART: '카트가 비어 있습니다',
  STORE_CANCEL_FAILED: '취소에 실패했습니다',

  // 주문 조회·상태 전이
  STORE_ORDER_NOT_PARTY: '주문 당사자만 조회할 수 있습니다',
  STORE_ACCEPT_NOT_ALLOWED: '접수할 수 없습니다 (상품주문중인 본인 매장 주문만 가능)',
  STORE_COMPLETE_NOT_ALLOWED:
    '거래 완료 처리할 수 없습니다 (구매자 수령 확인 후 본인 판매 주문만 가능)',
  STORE_PICKUP_NOT_ALLOWED: '픽업 처리할 수 없습니다 (상품준비완료된 본인 주문만 가능)',
  STORE_READY_NOT_ALLOWED:
    '준비완료 처리할 수 없습니다 (상품준비중인 본인 매장 주문만 가능)',
  STORE_RELEASE_NOT_ALLOWED:
    '수령 완료 처리할 수 없습니다 (거래중 상태의 본인 구매 주문만 가능)',
  STORE_CANCEL_REASON_REQUIRED: '취소 사유를 입력해주세요',
  STORE_ORDER_NOT_CANCELABLE: '취소할 수 없는 주문입니다',

  // 통화 환산 견적
  STORE_INVALID_CCY: '통화 코드가 올바르지 않습니다',
  STORE_INVALID_AMOUNT: '금액이 올바르지 않습니다',
  STORE_FX_UNAVAILABLE: '환율을 가져오지 못했습니다. Pi로 직접 입력해 주세요.',

  // 이용후기(FBCK) — 작성·검증
  FBCK_TARGET_REQUIRED_GET: 'shop_id, order_id 또는 item_id가 필요합니다',
  FBCK_TARGET_REQUIRED: 'shop_id 또는 order_id가 필요합니다',
  FBCK_SCORE_RANGE: '별점은 1~5점이어야 합니다',
  FBCK_CONTENT_MIN: '후기 본문은 최소 10자 이상이어야 합니다',
  FBCK_IMG_MAX: '이미지는 최대 5개까지 첨부 가능합니다',
  FBCK_ITEM_SCORE_RANGE: '항목 점수는 1~5점이어야 합니다',
  FBCK_NOT_CAFE_MEMBER: '해당 카페에 참여한 기록이 없습니다',
  FBCK_OWN_CAFE: '자신이 만든 카페에는 후기를 작성할 수 없습니다',
  FBCK_NOT_BUYER: '해당 주문의 구매자가 아닙니다',
  FBCK_ORDER_NOT_COMPLETE: '완료된 주문에 대해서만 후기를 작성할 수 있습니다',
  FBCK_SHOP_NOT_PARTICIPATING: '이 매장은 이용후기·보상 프로그램에 참여하지 않습니다',
  FBCK_SHOP_INFO_MISSING: '매장 정보를 확인할 수 없습니다',
  FBCK_BOND_INSUFFICIENT_SHOP:
    '이 매장은 후기 보상 보증금이 부족해 현재 후기를 받지 않습니다',
  FBCK_DUPLICATE: '이미 후기를 작성했습니다',
  FBCK_SAVE_FAILED: '후기 저장 실패',
  FBCK_BOND_INSUFFICIENT_PAY: '매장 보증금이 부족해 후기 보상을 지급할 수 없습니다',
  FBCK_REWARD_FAILED: '후기 보상 처리에 실패했습니다',

  // 이용후기(FBCK) — 수정·삭제
  FBCK_NOT_FOUND: '후기를 찾을 수 없습니다',
  FBCK_UPDATE_FORBIDDEN: '본인 후기만 수정할 수 있습니다',
  FBCK_EDIT_WINDOW_EXPIRED: '후기는 작성 후 24시간 내에만 수정할 수 있습니다',
  FBCK_DELETE_FORBIDDEN: '본인 후기만 삭제할 수 있습니다',

  // 이용후기(FBCK) — 보상 보증금 예치
  FBCK_INVALID_BOND_KIND: '잘못된 보증금 종류',
  FBCK_INVALID_DEPOSIT_QTY: '예치할 Bean 수량이 올바르지 않습니다',
  FBCK_PI_BOND_NOT_READY:
    'Pi 모드 보증금 예치는 준비 중입니다 (Bean 모드에서 예치하세요)',
  FBCK_INSUFFICIENT_BEAN: 'Bean 지갑 잔액이 부족합니다',
  FBCK_INVALID_DEPOSIT_AMOUNT: '예치 금액이 올바르지 않습니다',
  FBCK_DEPOSIT_FAILED: '예치 처리에 실패했습니다',

  // 이용후기(FBCK) — 평가 항목
  FBCK_CTGR_ID_REQUIRED: 'ctgr_id가 필요합니다',
  FBCK_ITEMS_QUERY_FAILED: '항목 조회 실패',

  // 구독(SUBSCR)
  SUBSCR_LEGACY_GONE:
    '레거시 Pi 구독은 종료되었습니다. Bean 구독(/subscribe)을 이용해 주세요.',
  SUBSCR_NO_ACTIVE_AUTORENEW: '자동 갱신 중인 구독이 없습니다',
  SUBSCR_CANCEL_FAILED: '구독 취소 실패',
  SUBSCR_PLANS_QUERY_FAILED: '플랜 목록 조회 실패',
  SUBSCR_INVALID_REQUEST: '잘못된 구독 요청',
  SUBSCR_PRODUCT_NOT_FOUND: '존재하지 않는 구독 상품',
  SUBSCR_INSUFFICIENT_BEAN: 'Bean 잔액이 부족합니다',
  SUBSCR_PROCESS_FAILED: '구독 처리 실패',
  SUBSCR_LIST_QUERY_FAILED: '구독 조회 실패',
} as const
