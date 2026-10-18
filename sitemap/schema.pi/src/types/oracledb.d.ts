// oracledb(Thin) 최소 타입 — src/lib/db-exec.ts·sql-run.ts 가 쓰는 것만. @types/oracledb 는 워크스페이스 잠금 파일의 @types/node 를 다시 풀어 cafe.pi 에 영향을 줘서 쓰지 않음(2026-10-18)
declare module 'oracledb' {
  export interface Metadata {
    name: string
    dbTypeName?: string
    dbType?: unknown
  }
  export interface ExecOpts {
    autoCommit?: boolean
    maxRows?: number
    outFormat?: number
    resultSet?: boolean
    fetchArraySize?: number
    fetchTypeHandler?: (m: Metadata) => { type: unknown } | undefined
  }
  export interface ResultSet {
    getRows(n: number): Promise<unknown[]>
    close(): Promise<void>
  }
  export interface Result {
    rows?: unknown[]
    resultSet?: ResultSet
    metaData?: Metadata[]
    rowsAffected?: number
  }
  export interface Connection {
    callTimeout: number
    execute(sql: string, binds?: unknown[], opts?: ExecOpts): Promise<Result>
    commit(): Promise<void>
    rollback(): Promise<void>
    close(): Promise<void>
  }
  const oracledb: {
    versionString: string
    thin: boolean
    OUT_FORMAT_ARRAY: number
    STRING: unknown
    BUFFER: unknown
    DB_TYPE_CLOB: unknown
    DB_TYPE_NCLOB: unknown
    DB_TYPE_BLOB: unknown
    getConnection(cfg: { user: string; password: string; connectString: string; connectTimeout?: number }): Promise<Connection>
  }
  export default oracledb
}
