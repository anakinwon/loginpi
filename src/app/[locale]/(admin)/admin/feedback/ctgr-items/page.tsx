'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

// /api/store/categories 와 동일한 트리 구조 (상품 등록 폼과 같은 소스)
interface CtgrNode {
  ctgr_id: string
  ctgr_nm: string
  children: CtgrNode[]
}

interface CtgrItem {
  item_id: string
  item_cd: string
  item_nm: string
  item_desc: string | null
  sort_ord: number
  mod_dtm: string
}

interface EditState {
  item_id: string
  item_nm: string
  item_desc: string
  sort_ord: string
}

interface AddState {
  item_cd: string
  item_nm: string
  item_desc: string
  sort_ord: string
}

const EMPTY_ADD: AddState = {
  item_cd: '',
  item_nm: '',
  item_desc: '',
  sort_ord: '0',
}

// 트리에서 ctgr_id에 해당하는 노드를 찾아 표시 레이블 반환
function findCtgrLabel(tree: CtgrNode[], ctgrId: string): string {
  for (const p of tree) {
    if (p.ctgr_id === ctgrId) return p.ctgr_nm
    for (const c of p.children) {
      if (c.ctgr_id === ctgrId) return `${p.ctgr_nm} > ${c.ctgr_nm}`
    }
  }
  return ''
}

export default function FbckCtgrItemsPage() {
  const [ctgrTree, setCtgrTree] = useState<CtgrNode[]>([])
  const [selectedCtgrId, setSelectedCtgrId] = useState('')
  const [items, setItems] = useState<CtgrItem[]>([])
  const [loadingCat, setLoadingCat] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState<AddState>(EMPTY_ADD)
  const [submittingAdd, setSubmittingAdd] = useState(false)
  const addCdRef = useRef<HTMLInputElement>(null)

  // 상품 등록 폼과 동일한 공개 카테고리 트리 로드
  useEffect(() => {
    void (async () => {
      setLoadingCat(true)
      try {
        const res = await fetch('/api/store/categories')
        if (!res.ok) throw new Error()
        const d = (await res.json()) as { categories: CtgrNode[] }
        setCtgrTree(d.categories)
      } catch {
        toast.error('카테고리 목록을 불러오지 못했습니다')
      } finally {
        setLoadingCat(false)
      }
    })()
  }, [])

  // 선택 카테고리의 평가 항목 로드
  const loadItems = useCallback(async (ctgrId: string) => {
    if (!ctgrId) return
    setLoadingItems(true)
    setEdit(null)
    setAdding(false)
    try {
      const res = await piFetch(
        `/api/admin/feedback/ctgr-items?ctgr_id=${ctgrId}`,
      )
      if (!res.ok) throw new Error()
      const d = (await res.json()) as { items: CtgrItem[] }
      setItems(d.items)
    } catch {
      toast.error('항목 목록을 불러오지 못했습니다')
    } finally {
      setLoadingItems(false)
    }
  }, [])

  useEffect(() => {
    if (selectedCtgrId) void loadItems(selectedCtgrId)
    else setItems([])
  }, [selectedCtgrId, loadItems])

  // 항목 수정 저장
  async function saveEdit(item: CtgrItem) {
    if (!edit) return
    setSaving(item.item_id)
    try {
      const res = await piFetch('/api/admin/feedback/ctgr-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.item_id,
          item_nm: edit.item_nm,
          item_desc: edit.item_desc,
          sort_ord: parseInt(edit.sort_ord, 10) || 0,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '수정 실패')
      }
      toast.success('항목이 수정되었습니다')
      setEdit(null)
      void loadItems(selectedCtgrId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수정 실패')
    } finally {
      setSaving(null)
    }
  }

  // 항목 논리삭제
  async function deleteItem(item: CtgrItem) {
    if (
      !confirm(
        `"${item.item_nm}" 항목을 삭제하시겠습니까?\n(이미 작성된 후기의 항목별 점수 표시에 영향을 줄 수 있습니다)`,
      )
    )
      return
    setSaving(item.item_id)
    try {
      const res = await piFetch(
        `/api/admin/feedback/ctgr-items?item_id=${item.item_id}`,
        {
          method: 'DELETE',
        },
      )
      if (!res.ok) throw new Error('삭제 실패')
      toast.success('항목이 삭제되었습니다')
      void loadItems(selectedCtgrId)
    } catch {
      toast.error('삭제 실패')
    } finally {
      setSaving(null)
    }
  }

  // 항목 추가
  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCtgrId) return
    setSubmittingAdd(true)
    try {
      const res = await piFetch('/api/admin/feedback/ctgr-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ctgr_id: selectedCtgrId,
          item_cd: addForm.item_cd,
          item_nm: addForm.item_nm,
          item_desc: addForm.item_desc,
          sort_ord: parseInt(addForm.sort_ord, 10) || 0,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '추가 실패')
      }
      toast.success('항목이 추가되었습니다')
      setAddForm(EMPTY_ADD)
      setAdding(false)
      void loadItems(selectedCtgrId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '추가 실패')
    } finally {
      setSubmittingAdd(false)
    }
  }

  const selectedLabel = selectedCtgrId
    ? findCtgrLabel(ctgrTree, selectedCtgrId)
    : ''

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-lg font-bold">⭐ 후기 평가항목 관리</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          카테고리별 항목별 별점 평가 항목을 관리합니다. 항목은 후기 작성 폼에
          표시됩니다.
        </p>
      </div>

      {/* 카테고리 선택 — 상품 등록 폼과 동일한 optgroup 구조 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">카테고리 선택</label>
        {loadingCat ? (
          <div className="bg-muted h-10 animate-pulse rounded-md" />
        ) : (
          <select
            value={selectedCtgrId}
            onChange={(e) => setSelectedCtgrId(e.target.value)}
            className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">— 카테고리를 선택하세요 —</option>
            {ctgrTree.map((p) => (
              <optgroup key={p.ctgr_id} label={p.ctgr_nm}>
                <option value={p.ctgr_id}>{p.ctgr_nm} (전체)</option>
                {p.children.map((c) => (
                  <option key={c.ctgr_id} value={c.ctgr_id}>
                    {c.ctgr_nm}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        {selectedCtgrId && (
          <p className="text-muted-foreground text-xs">
            {selectedLabel && (
              <span className="text-foreground mr-2 font-medium">
                {selectedLabel}
              </span>
            )}
            UUID:{' '}
            <code className="bg-muted rounded px-1">{selectedCtgrId}</code>
          </p>
        )}
      </div>

      {/* 평가 항목 목록 */}
      {selectedCtgrId && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              평가 항목{' '}
              <span className="text-muted-foreground font-normal">
                ({items.length}개)
              </span>
            </p>
            {!adding && (
              <button
                type="button"
                onClick={() => {
                  setAdding(true)
                  setEdit(null)
                  setTimeout(() => addCdRef.current?.focus(), 50)
                }}
                className="border-border hover:bg-accent rounded-md border border-dashed px-3 py-1 text-xs"
              >
                + 항목 추가
              </button>
            )}
          </div>

          {loadingItems ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-muted h-12 animate-pulse rounded-md"
                />
              ))}
            </div>
          ) : (
            <>
              {/* 항목 추가 폼 */}
              {adding && (
                <form
                  onSubmit={submitAdd}
                  className="border-primary/50 bg-primary/5 rounded-lg border border-dashed p-3"
                >
                  <p className="text-primary mb-2 text-xs font-semibold">
                    새 항목 추가
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <label className="text-muted-foreground text-xs">
                        코드 *
                      </label>
                      <input
                        ref={addCdRef}
                        required
                        maxLength={16}
                        placeholder="TASTE"
                        value={addForm.item_cd}
                        onChange={(e) =>
                          setAddForm((p) => ({
                            ...p,
                            item_cd: e.target.value.toUpperCase(),
                          }))
                        }
                        className="border-input bg-background focus:ring-ring w-full rounded-md border px-2 py-1.5 font-mono text-xs uppercase focus:ring-1 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-muted-foreground text-xs">
                        항목명 *
                      </label>
                      <input
                        required
                        maxLength={50}
                        placeholder="맛"
                        value={addForm.item_nm}
                        onChange={(e) =>
                          setAddForm((p) => ({ ...p, item_nm: e.target.value }))
                        }
                        className="border-input bg-background focus:ring-ring w-full rounded-md border px-2 py-1.5 text-xs focus:ring-1 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-muted-foreground text-xs">
                        설명 (선택)
                      </label>
                      <input
                        maxLength={100}
                        placeholder="음료 맛의 만족도"
                        value={addForm.item_desc}
                        onChange={(e) =>
                          setAddForm((p) => ({
                            ...p,
                            item_desc: e.target.value,
                          }))
                        }
                        className="border-input bg-background focus:ring-ring w-full rounded-md border px-2 py-1.5 text-xs focus:ring-1 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-muted-foreground text-xs">
                        순서
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={addForm.sort_ord}
                        onChange={(e) =>
                          setAddForm((p) => ({
                            ...p,
                            sort_ord: e.target.value,
                          }))
                        }
                        className="border-input bg-background focus:ring-ring w-full rounded-md border px-2 py-1.5 text-xs tabular-nums focus:ring-1 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false)
                        setAddForm(EMPTY_ADD)
                      }}
                      disabled={submittingAdd}
                      className="border-input hover:bg-accent rounded-md border px-3 py-1 text-xs disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={
                        submittingAdd || !addForm.item_cd || !addForm.item_nm
                      }
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
                    >
                      {submittingAdd ? '추가 중…' : '추가'}
                    </button>
                  </div>
                </form>
              )}

              {/* 항목 목록 */}
              {items.length === 0 && !adding ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                  등록된 평가 항목이 없습니다.
                  <br />
                  「+ 항목 추가」를 눌러 추가하세요.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((item) => {
                    const isEditing = edit?.item_id === item.item_id
                    const isBusy = saving === item.item_id
                    return (
                      <li key={item.item_id} className="rounded-lg border p-3">
                        {isEditing ? (
                          /* 인라인 수정 폼 */
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <div className="space-y-1">
                                <label className="text-muted-foreground text-xs">
                                  코드 (변경불가)
                                </label>
                                <p className="bg-muted rounded-md px-2 py-1.5 font-mono text-xs">
                                  {item.item_cd}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <label className="text-muted-foreground text-xs">
                                  항목명 *
                                </label>
                                <input
                                  autoFocus
                                  maxLength={50}
                                  value={edit.item_nm}
                                  onChange={(e) =>
                                    setEdit((p) =>
                                      p ? { ...p, item_nm: e.target.value } : p,
                                    )
                                  }
                                  className="border-input bg-background focus:ring-ring w-full rounded-md border px-2 py-1.5 text-xs focus:ring-1 focus:outline-none"
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-1">
                                <label className="text-muted-foreground text-xs">
                                  설명
                                </label>
                                <input
                                  maxLength={100}
                                  value={edit.item_desc}
                                  onChange={(e) =>
                                    setEdit((p) =>
                                      p
                                        ? { ...p, item_desc: e.target.value }
                                        : p,
                                    )
                                  }
                                  className="border-input bg-background focus:ring-ring w-full rounded-md border px-2 py-1.5 text-xs focus:ring-1 focus:outline-none"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-muted-foreground text-xs">
                                  순서
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step={10}
                                  value={edit.sort_ord}
                                  onChange={(e) =>
                                    setEdit((p) =>
                                      p
                                        ? { ...p, sort_ord: e.target.value }
                                        : p,
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void saveEdit(item)
                                    if (e.key === 'Escape') setEdit(null)
                                  }}
                                  className="border-input bg-background focus:ring-ring w-full rounded-md border px-2 py-1.5 text-xs tabular-nums focus:ring-1 focus:outline-none"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEdit(null)}
                                disabled={isBusy}
                                className="border-input hover:bg-accent rounded-md border px-3 py-1 text-xs disabled:opacity-50"
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveEdit(item)}
                                disabled={isBusy || !edit.item_nm.trim()}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
                              >
                                {isBusy ? '저장 중…' : '저장'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* 읽기 모드 */
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                                  {item.item_cd}
                                </code>
                                <span className="text-sm font-medium">
                                  {item.item_nm}
                                </span>
                                {item.item_desc && (
                                  <span className="text-muted-foreground truncate text-xs">
                                    ({item.item_desc})
                                  </span>
                                )}
                              </div>
                              <p className="text-muted-foreground mt-0.5 text-[10px]">
                                순서: {item.sort_ord} · 수정:{' '}
                                {new Date(item.mod_dtm).toLocaleString(
                                  'ko-KR',
                                  {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false,
                                  },
                                )}
                              </p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                type="button"
                                disabled={edit !== null || isBusy}
                                onClick={() =>
                                  setEdit({
                                    item_id: item.item_id,
                                    item_nm: item.item_nm,
                                    item_desc: item.item_desc ?? '',
                                    sort_ord: String(item.sort_ord),
                                  })
                                }
                                className="border-input hover:bg-accent rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void deleteItem(item)}
                                className="border-input text-destructive hover:bg-destructive/10 rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {isBusy ? '…' : '삭제'}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {/* 도움말 */}
      <div className="text-muted-foreground space-y-1 rounded-lg border p-3 text-xs">
        <p>
          • <strong>코드</strong>: 영문대문자·숫자·밑줄 1~16자 (예: TASTE,
          AROMA, TEMP)
        </p>
        <p>
          • <strong>순서</strong>: 낮은 숫자가 먼저 표시됩니다 (10 단위 권장)
        </p>
        <p>
          • 삭제 시 논리삭제(del_yn=Y) 처리되며, 이미 작성된 후기의 항목 점수는
          유지됩니다
        </p>
        <p>• 항목 코드는 수정이 불가하니 추가 시 신중히 입력하세요</p>
      </div>
    </div>
  )
}
