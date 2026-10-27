'use client'
// 내 배경 이미지 — 이 기기 IndexedDB 에만 둔다(서버 업로드 없음, 계획서 A-8). 최대 3장·각 2MB, 넘치면 오래된 것부터 지운다(rules.overflowIds)
import { BG, overflowIds } from './rules'

// small = 줄여 저장한 것(shrink). 이 표시가 없는 예전 저장분은 listMine 이 한 번 줄여 다시 저장한다
export type MyImage = { id: string; ts: number; blob: Blob; small?: true }

// 휴대폰 사진(12MP = 디코드 약 48MB)을 원본 그대로 두면 고를 때·썸네일마다 원본 해상도로 디코드돼 모바일 메모리가 바닥나고 영상이 끊긴다.
// 받자마자 폭 BG.outW 의 JPEG(수백 KB)로 줄여 그것만 쓰고 저장한다. resizeWidth 는 디코드 단계에서 줄인다(비율 유지) —
// 옵션을 무시하는 브라우저는 원본으로 오므로 해상도 상한(myPx)을 그대로 지킨다
export async function shrink(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob, { resizeWidth: BG.outW, resizeQuality: 'medium' }) // 못 읽는 형식(HEIC 등)은 여기서 실패
  try {
    if (bmp.width > BG.myPx || bmp.height > BG.myPx) throw new Error('too large')
    const k = Math.min(1, BG.outW / bmp.width)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * k))
    c.height = Math.max(1, Math.round(bmp.height * k))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('encode'))), 'image/jpeg', 0.85))
  } finally {
    bmp.close()
  }
}

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
    // 용량 초과(QuotaExceededError) 등은 abort 로만 끝난다 — 안 받으면 Promise 가 영원히 멈춘다
    t.onerror = t.onabort = () => {
      db.close()
      no(t.error ?? new Error('abort'))
    }
  })
}

export async function listMine(): Promise<MyImage[]> {
  const all = (await tx('readonly', (s) => s.getAll() as IDBRequest<MyImage[]>)) ?? []
  // 줄이기 전에 저장된 원본 — 한 번 줄여 같은 id·ts 로 덮어쓴다(실패하면 원본 그대로 두고 다음에 다시)
  for (const m of all) {
    if (m.small) continue
    try {
      m.blob = await shrink(m.blob)
      m.small = true
      await tx('readwrite', (s) => void s.put(m))
    } catch {}
  }
  return all.sort((a, b) => b.ts - a.ts) // 최신 먼저
}

export async function addMine(blob: Blob, id = crypto.randomUUID()): Promise<MyImage> {
  const img: MyImage = { id, ts: Date.now(), blob, small: true } // blob 은 shrink 를 거친 것
  await tx('readwrite', (s) => void s.put(img))
  const drop = overflowIds(await listMine())
  if (drop.length) await tx('readwrite', (s) => drop.forEach((id) => s.delete(id)))
  return img
}

export const removeMine = (id: string) => tx('readwrite', (s) => void s.delete(id))
