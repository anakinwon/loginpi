'use client'
// 내 배경 이미지 — 이 기기 IndexedDB 에만 둔다(서버 업로드 없음, 계획서 A-8). 최대 3장·각 2MB, 넘치면 오래된 것부터 지운다(rules.overflowIds)
import { overflowIds } from './rules'

export type MyImage = { id: string; ts: number; blob: Blob }

const DB = 'smn-bg'
const STORE = 'img'

function open(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const q = indexedDB.open(DB, 1)
    q.onupgradeneeded = () => q.result.createObjectStore(STORE, { keyPath: 'id' })
    q.onsuccess = () => ok(q.result)
    q.onerror = () => no(q.error)
  })
}

// 저장소 1개에 작업 하나 — 트랜잭션이 끝나면(complete) 결과를 돌려준다
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  return new Promise((ok, no) => {
    const t = db.transaction(STORE, mode)
    const q = fn(t.objectStore(STORE))
    t.oncomplete = () => {
      db.close()
      ok(q ? q.result : undefined)
    }
    t.onerror = () => {
      db.close()
      no(t.error)
    }
  })
}

export async function listMine(): Promise<MyImage[]> {
  const all = (await tx('readonly', (s) => s.getAll() as IDBRequest<MyImage[]>)) ?? []
  return all.sort((a, b) => b.ts - a.ts) // 최신 먼저
}

export async function addMine(blob: Blob): Promise<MyImage> {
  const img = { id: crypto.randomUUID(), ts: Date.now(), blob }
  await tx('readwrite', (s) => void s.put(img))
  const drop = overflowIds(await listMine())
  if (drop.length) await tx('readwrite', (s) => drop.forEach((id) => s.delete(id)))
  return img
}

export const removeMine = (id: string) => tx('readwrite', (s) => void s.delete(id))
