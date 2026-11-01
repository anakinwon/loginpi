// SQL 튜닝 입력칸 채움 키 — 다른 화면(느린 쿼리 출처 등)이 sessionStorage 에 쿼리문을 1회 넣고, sql-lab 이 읽은 뒤 지운다(쿼리문을 URL·서버 로그에 싣지 않음)
export const SQL_LAB_SEED = 'dbms.sqlLab.seed'
