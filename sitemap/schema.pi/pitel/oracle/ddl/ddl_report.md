# Oracle DDL 생성 보고 (2026-11-22)

생성 : `node oracle/ddl-oracle.mjs` · 원천 : `model/physical/*.json` · 엔진 : schema.pi ModelPi `genDdl`(Oracle 0001)

| 항목 | 값 |
|---|---:|
| 테이블 | 214 |
| 조각 테이블 · 조각 | 38 · 2306 |
| PK | 214 |
| 보조 인덱스 | 318 |
| 부분 인덱스 → 일반 인덱스(같은 결과) | 70 |
| 부분 인덱스 → 함수 기반 인덱스 | 26 |
| CLOB 으로 바꾼 칼럼 | 0 |
| 30자 한도로 줄인 이름 | 10 |

## 30자 한도로 줄인 이름
- X_PTL_PAY_USE_QTY_CLCT_FILE_L_01 → X_PTL_PAY_USE_QTY_CLCT_FILE_01
- X_PTL_PAY_USE_QTY_CLCT_FILE_L_02 → X_PTL_PAY_USE_QTY_CLCT_FILE_02
- PK_PTL_INV_CARD_ATMT_PAY_APRV_L → PK_PTL_INV_CARD_ATMT_PAY_APRV_
- X_PTL_INV_CARD_ATMT_PAY_APRV_L_01 → X_PTL_INV_CARD_ATMT_PAY_APR_01
- X_PTL_INV_CARD_ATMT_PAY_APRV_L_02 → X_PTL_INV_CARD_ATMT_PAY_APR_02
- X_PTL_INV_CARD_ATMT_PAY_APRV_L_03 → X_PTL_INV_CARD_ATMT_PAY_APR_03
- X_PTL_INV_CARD_ATMT_PAY_APRV_L_04 → X_PTL_INV_CARD_ATMT_PAY_APR_04
- X_PTL_INV_CARD_ATMT_PAY_APRV_L_05 → X_PTL_INV_CARD_ATMT_PAY_APR_05
- X_PTL_INV_CASH_RCIPT_PBLCN_L_01 → X_PTL_INV_CASH_RCIPT_PBLCN__01
- X_PTL_INV_CASH_RCIPT_PBLCN_L_02 → X_PTL_INV_CASH_RCIPT_PBLCN__02

## CLOB 칼럼

## 함수 기반 인덱스로 바꾼 부분 인덱스
- X_PTL_CUS_CUST_CVLCPT_L_03 : PRCS_CMPTN_DTM IS NULL
- X_PTL_ORD_SBSC_CTRT_M_05 : agnc_no IS NOT NULL
- X_PTL_ORD_SUBSD_APLCN_L_01 : shop_no IS NOT NULL
- X_PTL_ORD_PAUS_L_03 : paus_rls_dtm IS NULL
- X_PTL_PAY_RAW_USE_L_03 : raw_use_prcs_stts_ty_cd IN ('01','02','03','05')
- X_PTL_PAY_USE_L_04 : use_rat_stts_ty_cd IN ('01','03','05')
- X_PTL_PAY_BILL_M_04 : bill_stts_ty_cd IN ('03','05','06')
- X_PTL_PAY_BILL_ADJ_L_02 : bill_adj_stts_ty_cd = '02'
- X_PTL_PAY_USE_QTY_ERR_L_02 : err_prcs_stts_ty_cd IN ('01','02')
- X_PTL_INV_RCV_M_04 : RCV_AGT_INST_NO IS NOT NULL
- X_PTL_INV_RCV_M_05 : RCV_STTS_TY_CD IN ('01','03')
- X_PTL_INV_ATRF_APLY_L_03 : PRCS_RSLT_TY_CD IS NULL
- X_PTL_INV_OVPAY_M_02 : OVPAY_BAL > 0
- X_PTL_INV_ATRF_WDRW_RSLT_L_01 : RE_WDRW_TRGT_YN = 'Y'
- X_PTL_INV_ATRF_WDRW_RSLT_L_02 : WDRW_RSLT_TY_CD <> '01'
- X_PTL_INV_UNIDNTF_DPST_L_01 : UNIDNTF_DPST_STTS_TY_CD = '01'
- X_PTL_INV_CASH_RCIPT_PBLCN__02 : NTS_TRNM_DTM IS NULL
- X_PTL_COL_UNPD_M_04 : unpd_stts_ty_cd IN ('01','02','04')
- X_PTL_COL_DUN_L_02 : dun_sndng_stts_ty_cd = '01'
- X_PTL_COL_SUSP_M_03 : susp_stts_ty_cd IN ('01','02')
- X_PTL_COL_EXOFTRMN_M_04 : exoftrmn_stts_ty_cd IN ('01','02')
- X_PTL_COL_DIV_PAY_TMS_D_02 : div_pay_tms_stts_ty_cd IN ('01','03')
- X_PTL_COL_RCVB_PRSCR_H_01 : vld_end_dtm = '9999-12-31 23:59:59'
- X_PTL_PRM_PRTNR_CTRT_M_02 : ctrt_trmn_dt IS NULL
- X_PTL_PRM_TXINV_M_05 : nts_trnm_dtm IS NULL
- X_PTL_PRM_STLM_GIVE_L_02 : prtnr_no IS NOT NULL

## 일시 문자열 → TIMESTAMP 리터럴
- X_PTL_COL_RCVB_PRSCR_H_01 : vld_end_dtm = '9999-12-31 23:59:59' → vld_end_dtm = TIMESTAMP '9999-12-31 23:59:59'

## 기본값
- PTL_ORD_SVC_NO_M.SVC_NO_ASGN_NMTM DEFAULT 0
- PTL_ORD_CMBN_CTRT_M.CMBN_LINE_CNT DEFAULT 0
