import { SpikeRunner } from './_components/spike-runner'

export default function VoiceTestPage() {
  return (
    <div className='mx-auto max-w-xl px-4 py-8'>
      <div className='mb-6'>
        <h1 className='text-xl font-bold'>🎙️ PiVoice™ S0 스파이크</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Pi Browser 실기기에서 WebRTC 음성통화 지원 여부를 진단합니다.
        </p>
        <div className='mt-3 rounded-lg bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400'>
          <strong>실기기 안내</strong><br />
          Pi Browser에서 이 페이지를 열고 버튼을 누르면 마이크 권한 요청이 뜹니다.<br />
          허용 후 모든 항목이 ✅이면 <strong>S0 GO</strong> — 음성통화 구현 진행 가능합니다.
        </div>
      </div>

      <SpikeRunner />

      <div className='mt-8 rounded-xl border bg-card p-4 text-xs text-muted-foreground space-y-1'>
        <p className='font-medium text-foreground'>체크 항목 설명</p>
        <p>• <strong>getUserMedia</strong> — 브라우저가 마이크 API를 지원하고 실제 트랙을 획득하는지</p>
        <p>• <strong>RTCPeerConnection</strong> — P2P 연결 객체 존재 여부</p>
        <p>• <strong>Opus 코덱</strong> — 저지연 음성 코덱(24~32kbps) 지원 여부</p>
        <p>• <strong>ICE Candidate</strong> — STUN 서버로 공인 IP 반사 주소 획득 (NAT 통과 가능 여부)</p>
        <p className='mt-2'>⚠️ iOS Pi Browser에서 마이크가 작동하지 않으면 PRD 10절 &quot;미해결 리스크&quot; 항목 검토 필요</p>
      </div>
    </div>
  )
}
