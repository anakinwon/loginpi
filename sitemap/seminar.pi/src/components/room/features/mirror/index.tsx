'use client'
// 내 화면 거울 보기(Zoom·Teams '내 비디오 미러링'과 같은 선택) — 켜면 내 타일·대기실 미리보기만 좌우 반전(CSS), 보내는 영상은 원본 그대로.
// 기본 켬(거울에 익숙한 방향). 이 기기에만 기억(localStorage, 막혀 있으면 이번 방문 동안만) — 퇴장해도 유지라 onReset 없음
import { featureStore, type RoomFeature } from '../../extensions'

const KEY = 'smn-mirror'

function saved() {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export const mirrorOn = featureStore(saved())
mirrorOn.sub(() => {
  try {
    localStorage.setItem(KEY, mirrorOn.get() ? '1' : '0')
  } catch {}
})

export const mirror: RoomFeature = {
  id: 'mirror',
  more: [
    {
      id: 'mirror',
      label: 'mirror',
      icon: <span aria-hidden>⇆</span>,
      roles: ['presenter', 'panel'],
      checked: mirrorOn,
      onClick: () => mirrorOn.set((v) => !v),
    },
  ],
}
