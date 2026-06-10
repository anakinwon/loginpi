'use client'
import { useState } from 'react'

// PiTranslate™ 번역/원문 전환 (TASK-097)
// 기본은 번역 텍스트 표시 — [원문 보기] 토글로 번역 투명성 보장
export function TranslatedMessage({ original, translated }: {
  original: string
  translated: string
}) {
  const [showOriginal, setShowOriginal] = useState(false)

  return (
    <div className='flex flex-col gap-1'>
      <span className='whitespace-pre-wrap'>{showOriginal ? original : translated}</span>
      <button
        type='button'
        onClick={() => setShowOriginal(v => !v)}
        className='self-start text-[10px] underline opacity-60 transition-opacity hover:opacity-100'
      >
        {showOriginal ? '번역 보기' : '원문 보기'}
      </button>
    </div>
  )
}
