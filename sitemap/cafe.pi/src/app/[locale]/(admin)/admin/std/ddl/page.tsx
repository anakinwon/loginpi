'use client'

import { useEffect, useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { piFetch } from '@/lib/pi-fetch'

const DOM_TYPE_MAP: Record<string, { pg: string; mysql: string }> = {
  NM: { pg: 'VARCHAR(100)', mysql: 'VARCHAR(100)' },
  CD: { pg: 'VARCHAR(20)', mysql: 'VARCHAR(20)' },
  NO: { pg: 'VARCHAR(50)', mysql: 'VARCHAR(50)' },
  ID: { pg: 'VARCHAR(20)', mysql: 'VARCHAR(20)' },
  YN: { pg: 'CHAR(1)', mysql: 'CHAR(1)' },
  DT: { pg: 'DATE', mysql: 'DATE' },
  DTM: { pg: 'TIMESTAMP', mysql: 'DATETIME' },
  ADDR: { pg: 'TEXT', mysql: 'TEXT' },
  CONT: { pg: 'TEXT', mysql: 'TEXT' },
  EMADDR: { pg: 'VARCHAR(200)', mysql: 'VARCHAR(200)' },
  PRICE: { pg: 'NUMERIC(15,2)', mysql: 'DECIMAL(15,2)' },
  CNT: { pg: 'INTEGER', mysql: 'INT' },
  LVL: { pg: 'INTEGER', mysql: 'INT' },
  SZ: { pg: 'INTEGER', mysql: 'INT' },
  TTL: { pg: 'VARCHAR(500)', mysql: 'VARCHAR(500)' },
}

interface TermOption {
  term_id: string
  term_log_nm: string
  term_phy_nm: string
}

interface ColumnDef {
  id: string
  col_nm: string
  col_log_nm: string
  col_type_pg: string
  col_type_mysql: string
  not_null: boolean
  is_pk: boolean
}

function inferType(phy_nm: string): { pg: string; mysql: string } {
  const parts = phy_nm.split('_')
  const last = parts[parts.length - 1].toUpperCase()
  if (DOM_TYPE_MAP[last]) return DOM_TYPE_MAP[last]
  const last2 = parts.slice(-2).join('').toUpperCase()
  if (DOM_TYPE_MAP[last2]) return DOM_TYPE_MAP[last2]
  return { pg: 'VARCHAR(100)', mysql: 'VARCHAR(100)' }
}

function buildDDL(
  tableName: string,
  tableLogNm: string,
  columns: ColumnDef[],
  dbType: 'pg' | 'mysql',
): string {
  if (!tableName || columns.length === 0) return ''

  const lines: string[] = []
  if (tableLogNm) lines.push(`-- ${tableLogNm}`)
  lines.push(`CREATE TABLE ${tableName} (`)

  const pad = Math.max(...columns.map((c) => c.col_nm.length)) + 2
  const colLines = columns.map((col) => {
    const type = dbType === 'pg' ? col.col_type_pg : col.col_type_mysql
    const nn = col.not_null ? ' NOT NULL' : ''
    return `  ${col.col_nm.padEnd(pad)}${type}${nn},`
  })

  const pks = columns.filter((c) => c.is_pk).map((c) => c.col_nm)

  if (pks.length > 0) {
    lines.push(...colLines)
    lines.push(`  PRIMARY KEY (${pks.join(', ')})`)
  } else {
    colLines[colLines.length - 1] = colLines[colLines.length - 1].slice(0, -1)
    lines.push(...colLines)
  }
  lines.push(');')

  if (dbType === 'pg' && tableLogNm) {
    lines.push('')
    lines.push(`COMMENT ON TABLE ${tableName} IS '${tableLogNm}';`)
    columns.forEach((col) => {
      lines.push(
        `COMMENT ON COLUMN ${tableName}.${col.col_nm} IS '${col.col_log_nm}';`,
      )
    })
  }

  return lines.join('\n')
}

export default function DdlExportPage() {
  const t = useTranslations('admin.std.ddl')
  const [tableName, setTableName] = useState('')
  const [tableLogNm, setTableLogNm] = useState('')
  const [columns, setColumns] = useState<ColumnDef[]>([])
  const [allTerms, setAllTerms] = useState<TermOption[]>([])
  const [termSearch, setTermSearch] = useState('')
  const [dbType, setDbType] = useState<'pg' | 'mysql'>('pg')

  useEffect(() => {
    piFetch('/api/admin/std/terms')
      .then((r) => r.json())
      .then((d: { terms: TermOption[] }) => setAllTerms(d.terms ?? []))
  }, [])

  const filteredTerms = useMemo(() => {
    const q = termSearch.toLowerCase()
    return allTerms
      .filter(
        (term) => term.term_log_nm.includes(q) || term.term_phy_nm.includes(q),
      )
      .slice(0, 10)
  }, [allTerms, termSearch])

  const ddl = useMemo(
    () => buildDDL(tableName, tableLogNm, columns, dbType),
    [tableName, tableLogNm, columns, dbType],
  )

  function addFromTerm(term: TermOption) {
    const types = inferType(term.term_phy_nm)
    setColumns((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        col_nm: term.term_phy_nm,
        col_log_nm: term.term_log_nm,
        col_type_pg: types.pg,
        col_type_mysql: types.mysql,
        not_null: false,
        is_pk: false,
      },
    ])
    setTermSearch('')
  }

  function removeColumn(id: string) {
    setColumns((prev) => prev.filter((c) => c.id !== id))
  }

  function moveColumn(id: string, dir: 'up' | 'down') {
    setColumns((prev) => {
      const idx = prev.findIndex((c) => c.id === id)
      if (dir === 'up' && idx === 0) return prev
      if (dir === 'down' && idx === prev.length - 1) return prev
      const next = [...prev]
      const swap = dir === 'up' ? idx - 1 : idx + 1
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  function updateColumn(id: string, patch: Partial<ColumnDef>) {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    )
  }

  function copyDdl() {
    navigator.clipboard.writeText(ddl)
    toast.success(t('copySuccess'))
  }

  function downloadDdl() {
    const blob = new Blob([ddl], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tableName || 'table'}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('desc')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">{t('sectionTable')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs">
                  {t('field.tableNmEn')}
                </span>
                <Input
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder={t('placeholder.tableNmEn')}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs">
                  {t('field.tableNmKo')}
                </span>
                <Input
                  value={tableLogNm}
                  onChange={(e) => setTableLogNm(e.target.value)}
                  placeholder={t('placeholder.tableNmKo')}
                />
              </label>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">{t('sectionColumn')}</h2>
            <div className="relative">
              <Input
                value={termSearch}
                onChange={(e) => setTermSearch(e.target.value)}
                placeholder={t('placeholder.termSearch')}
              />
              {termSearch && filteredTerms.length > 0 && (
                <div className="bg-background absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-md border shadow-lg">
                  {filteredTerms.map((term) => (
                    <button
                      key={term.term_id}
                      onClick={() => addFromTerm(term)}
                      className="hover:bg-muted flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                    >
                      <span>{term.term_log_nm}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {term.term_phy_nm}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {columns.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('col.colLogNm')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('col.type')}
                    </th>
                    <th className="px-2 py-2 text-center font-medium">
                      {t('col.pk')}
                    </th>
                    <th className="px-2 py-2 text-center font-medium">
                      {t('col.nn')}
                    </th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {columns.map((col, i) => (
                    <tr key={col.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-mono">{col.col_nm}</div>
                        <div className="text-muted-foreground text-xs">
                          {col.col_log_nm}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={
                            dbType === 'pg'
                              ? col.col_type_pg
                              : col.col_type_mysql
                          }
                          onChange={(e) =>
                            updateColumn(
                              col.id,
                              dbType === 'pg'
                                ? { col_type_pg: e.target.value }
                                : { col_type_mysql: e.target.value },
                            )
                          }
                          className="h-7 w-36 font-mono text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={col.is_pk}
                          onChange={(e) =>
                            updateColumn(col.id, {
                              is_pk: e.target.checked,
                              not_null: e.target.checked ? true : col.not_null,
                            })
                          }
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={col.not_null}
                          onChange={(e) =>
                            updateColumn(col.id, { not_null: e.target.checked })
                          }
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => moveColumn(col.id, 'up')}
                            disabled={i === 0}
                            className="text-muted-foreground hover:text-foreground px-1 py-0.5 disabled:opacity-25"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveColumn(col.id, 'down')}
                            disabled={i === columns.length - 1}
                            className="text-muted-foreground hover:text-foreground px-1 py-0.5 disabled:opacity-25"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeColumn(col.id)}
                            className="text-muted-foreground hover:text-destructive px-1 py-0.5"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('sectionPreview')}</h2>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-md border text-xs">
                {(['pg', 'mysql'] as const).map((dbT) => (
                  <button
                    key={dbT}
                    onClick={() => setDbType(dbT)}
                    className={`px-3 py-1.5 font-medium transition-colors ${
                      dbType === dbT
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {dbT === 'pg' ? 'PostgreSQL' : 'MySQL'}
                  </button>
                ))}
              </div>
              {ddl && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={copyDdl}
                  >
                    {t('copy')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={downloadDdl}
                  >
                    {t('download')}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <pre className="bg-muted/30 min-h-72 overflow-x-auto rounded-lg border p-4 font-mono text-xs leading-relaxed whitespace-pre">
            {ddl || (
              <span className="text-muted-foreground">{t('emptyPreview')}</span>
            )}
          </pre>
        </div>
      </div>
    </div>
  )
}
