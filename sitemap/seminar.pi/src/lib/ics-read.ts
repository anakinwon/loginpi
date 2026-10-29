// iCal(.ics) 읽기 — Google 캘린더 '비공개 iCal 주소' 일정을 달력에 점으로 보이기 위한 최소 해석(서버·시험 공용, 순수 함수).
//  지원 : VEVENT 의 DTSTART·DTEND·SUMMARY, 접힌 줄 펼치기, UTC(Z)·종일(DATE)·TZID(지역 시간 — 오프셋 계산 없이 그 시각을 UTC 로 근사)
//  ponytail: 반복 일정(RRULE)은 첫 회만 보인다 — 반복 펼치기가 필요하면 rrule 해석 추가
export type IcsEvent = { start: string; end: string | null; title: string; allDay: boolean; place?: string }

// Google 캘린더 비공개 iCal 주소만 허용(서버가 대신 읽는 주소 — SSRF 방지)
export const icsUrlOk = (u: string) => {
  try {
    const x = new URL(u)
    return x.protocol === 'https:' && x.hostname === 'calendar.google.com' && x.pathname.startsWith('/calendar/ical/') && x.pathname.endsWith('.ics')
  } catch {
    return false
  }
}

// 화면 표시용 캘린더 이름 = 주소의 캘린더 ID(보통 메일 주소). 비밀 부분(private-…)은 빼고 보여 준다
export const icsLabel = (u: string) => {
  try {
    return decodeURIComponent(new URL(u).pathname.split('/')[3] ?? '')
  } catch {
    return ''
  }
}

function toIso(v: string): { iso: string; allDay: boolean } | null {
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (d) return { iso: `${d[1]}-${d[2]}-${d[3]}`, allDay: true }
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v)
  if (!t) return null
  return { iso: `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}${t[7] ? 'Z' : ''}`, allDay: false }
}

const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1')

// from·to(ISO 날짜) 사이에 시작하는 일정만, 시작 순, 최대 max 건
export function parseIcs(text: string, from: string, to: string, max = 300): IcsEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const out: IcsEvent[] = []
  let cur: Partial<IcsEvent> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {}
    else if (line === 'END:VEVENT') {
      if (cur?.start && cur.start.slice(0, 10) >= from && cur.start.slice(0, 10) <= to)
        out.push({
          start: cur.start,
          end: cur.end ?? null,
          title: cur.title || '(제목 없음)',
          allDay: !!cur.allDay,
          ...(cur.place ? { place: cur.place } : {}),
        })
      cur = null
    } else if (cur) {
      const i = line.indexOf(':')
      if (i < 0) continue
      const key = line.slice(0, i).split(';')[0]
      const val = line.slice(i + 1)
      if (key === 'DTSTART') {
        const r = toIso(val)
        if (r) Object.assign(cur, { start: r.iso, allDay: r.allDay })
      } else if (key === 'DTEND') cur.end = toIso(val)?.iso ?? null
      else if (key === 'SUMMARY') cur.title = unescape(val).slice(0, 200)
      else if (key === 'LOCATION') cur.place = unescape(val).slice(0, 200)
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, max)
}
