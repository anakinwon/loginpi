'use client'
import { useState, useCallback } from 'react'

type Status = 'idle' | 'running' | 'pass' | 'fail' | 'warn'

interface CheckResult {
  id: string
  label: string
  status: Status
  detail: string
}

const ICON: Record<Status, string> = {
  idle: '⬜',
  running: '⏳',
  pass: '✅',
  fail: '❌',
  warn: '⚠️',
}

export function SpikeRunner() {
  const [results, setResults] = useState<CheckResult[]>([])
  const [running, setRunning] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const update = useCallback((id: string, status: Status, detail: string) => {
    setResults(prev =>
      prev.map(r => r.id === id ? { ...r, status, detail } : r)
    )
  }, [])

  const runSpike = useCallback(async () => {
    setRunning(true)
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)

    const checks: CheckResult[] = [
      { id: 'ua',       label: 'User-Agent 확인',                   status: 'running', detail: '' },
      { id: 'md',       label: 'navigator.mediaDevices 존재',        status: 'running', detail: '' },
      { id: 'gum',      label: 'getUserMedia API 존재',              status: 'running', detail: '' },
      { id: 'mic',      label: '마이크 권한 + 오디오 트랙 획득',      status: 'running', detail: '' },
      { id: 'rtc',      label: 'RTCPeerConnection 존재',             status: 'running', detail: '' },
      { id: 'codec',    label: 'Opus 코덱 지원',                     status: 'running', detail: '' },
      { id: 'ice',      label: 'ICE Candidate 수집 (STUN)',          status: 'running', detail: '' },
    ]
    setResults(checks)

    // 1. User-Agent
    const ua = navigator.userAgent
    const isPiBrowser = /PiBrowser|Pi\s?Browser/i.test(ua)
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
    const isAndroid = /Android/i.test(ua)
    update('ua', 'pass', `${isPiBrowser ? '🟣 Pi Browser' : '🌐 일반 브라우저'} | ${isIOS ? 'iOS' : isAndroid ? 'Android' : 'Desktop'} | ${ua.slice(0, 80)}`)

    // 2. mediaDevices 존재
    if (!navigator.mediaDevices) {
      update('md', 'fail', 'navigator.mediaDevices 없음 — HTTP 환경이거나 WebRTC 미지원 브라우저')
      update('gum', 'fail', '상위 체크 실패로 건너뜀')
      update('mic', 'fail', '상위 체크 실패로 건너뜀')
      update('rtc', 'idle', '')
      update('codec', 'idle', '')
      update('ice', 'idle', '')
      setRunning(false)
      return
    }
    update('md', 'pass', 'navigator.mediaDevices 확인')

    // 3. getUserMedia 존재
    if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
      update('gum', 'fail', 'getUserMedia 함수 없음')
      update('mic', 'fail', '상위 체크 실패로 건너뜀')
    } else {
      update('gum', 'pass', 'getUserMedia 함수 존재')

      // 4. 실제 마이크 획득 시도
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
        const tracks = s.getAudioTracks()
        setStream(s)
        const settings = tracks[0]?.getSettings?.() ?? {}
        update('mic', 'pass',
          `트랙 ${tracks.length}개 획득 | label: "${tracks[0]?.label ?? '없음'}" | ` +
          `sampleRate: ${(settings as { sampleRate?: number }).sampleRate ?? '?'}Hz | ` +
          `channelCount: ${(settings as { channelCount?: number }).channelCount ?? '?'}`)
      } catch (e) {
        const err = e as DOMException
        const detail =
          err.name === 'NotAllowedError' ? '권한 거부 (사용자 또는 시스템)' :
          err.name === 'NotFoundError'   ? '마이크 장치 없음' :
          err.name === 'NotReadableError'? '마이크 사용 중 (다른 앱)' :
          `${err.name}: ${err.message}`
        update('mic', err.name === 'NotAllowedError' ? 'warn' : 'fail', detail)
      }
    }

    // 5. RTCPeerConnection 존재
    const RTC = window.RTCPeerConnection
    if (!RTC) {
      update('rtc', 'fail', 'RTCPeerConnection 없음')
      update('codec', 'fail', '상위 체크 실패로 건너뜀')
      update('ice', 'fail', '상위 체크 실패로 건너뜀')
      setRunning(false)
      return
    }
    update('rtc', 'pass', 'RTCPeerConnection 존재')

    // 6. Opus 코덱 확인
    try {
      const caps = RTCRtpReceiver.getCapabilities?.('audio')
      const codecs = caps?.codecs ?? []
      const opus = codecs.find(c => c.mimeType.toLowerCase() === 'audio/opus')
      if (opus) {
        update('codec', 'pass', `Opus 지원 확인 | clockRate: ${opus.clockRate} | channels: ${opus.channels ?? 1}`)
      } else {
        const names = codecs.map(c => c.mimeType).join(', ')
        update('codec', 'warn', `Opus 없음 — 지원 코덱: ${names || '정보 없음'}`)
      }
    } catch {
      update('codec', 'warn', 'getCapabilities API 미지원 (브라우저 구버전)')
    }

    // 7. ICE Candidate 수집 (STUN 연결 테스트)
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      // 더미 데이터채널 — candidate 수집 트리거
      pc.createDataChannel('probe')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const candidates: string[] = []
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000)
        pc.onicecandidate = ({ candidate }) => {
          if (!candidate) { clearTimeout(timer); resolve(); return }
          if (candidate.type) candidates.push(candidate.type)
        }
      })
      pc.close()

      const hasSrflx = candidates.includes('srflx')
      const hasHost  = candidates.includes('host')
      update('ice', hasSrflx || hasHost ? 'pass' : 'warn',
        `후보 ${candidates.length}개 수집 | ` +
        `host: ${candidates.filter(c => c === 'host').length} | ` +
        `srflx(STUN): ${candidates.filter(c => c === 'srflx').length} | ` +
        `relay(TURN): ${candidates.filter(c => c === 'relay').length}`)
    } catch (e) {
      update('ice', 'fail', `ICE 수집 오류: ${(e as Error).message}`)
    }

    setRunning(false)
  }, [stream, update])

  const stopMic = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
  }, [stream])

  const passCount = results.filter(r => r.status === 'pass').length
  const failCount = results.filter(r => r.status === 'fail').length
  const warnCount = results.filter(r => r.status === 'warn').length

  return (
    <div className='space-y-4'>
      <div className='flex gap-2'>
        <button
          onClick={runSpike}
          disabled={running}
          className='rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50'
        >
          {running ? '⏳ 검사 중…' : '🔬 S0 스파이크 실행'}
        </button>
        {stream && (
          <button
            onClick={stopMic}
            className='rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white'
          >
            🎙️ 마이크 해제
          </button>
        )}
      </div>

      {results.length > 0 && (
        <>
          <div className='flex gap-3 text-sm'>
            <span className='text-green-600'>✅ {passCount}개 통과</span>
            {warnCount > 0 && <span className='text-yellow-600'>⚠️ {warnCount}개 경고</span>}
            {failCount > 0 && <span className='text-destructive'>❌ {failCount}개 실패</span>}
          </div>

          <ul className='divide-y divide-border rounded-xl border bg-card'>
            {results.map(r => (
              <li key={r.id} className='flex flex-col gap-0.5 px-4 py-3'>
                <div className='flex items-center gap-2 text-sm font-medium'>
                  <span>{ICON[r.status]}</span>
                  <span>{r.label}</span>
                </div>
                {r.detail && (
                  <p className='break-all pl-6 text-xs text-muted-foreground'>{r.detail}</p>
                )}
              </li>
            ))}
          </ul>

          {!running && failCount === 0 && (
            <div className='rounded-xl bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-700 dark:text-green-400'>
              🎉 S0 GO — WebRTC 1:1 음성통화 구현 진행 가능
            </div>
          )}
          {!running && failCount > 0 && (
            <div className='rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive'>
              🚫 S0 NO-GO — 실패 항목 확인 필요 (PRD 10절 리스크 참조)
            </div>
          )}
        </>
      )}
    </div>
  )
}
