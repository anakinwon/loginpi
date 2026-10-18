// oracledb(Thin) 최소 타입 — src/lib/db-exec.ts 가 쓰는 것만. @types/oracledb 는 워크스페이스 잠금 파일의 @types/node 를 다시 풀어 cafe.pi 에 영향을 줘서 쓰지 않음(2026-10-18)
declare module 'oracledb' {
  export interface Connection {
    callTimeout: number
    execute(sql: string, binds?: unknown[], opts?: { autoCommit?: boolean }): Promise<{ rows?: unknown[] }>
    close(): Promise<void>
  }
  const oracledb: {
    versionString: string
    thin: boolean
    getConnection(cfg: { user: string; password: string; connectString: string; connectTimeout?: number }): Promise<Connection>
  }
  export default oracledb
}
