import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// 채팅방 테마별 AI 봇 시스템 프롬프트
// @ai 멘션 → 방 테마에 맞는 전문 역할로 응답
const THEME_PROMPTS: Record<string, string> = {
  GOLF: '당신은 골프 코치 AI입니다. 스윙, 코스 전략, 클럽 선택, 핸디캡 등 골프 관련 질문에 한국어로 3~5문장 이내로 답변하세요.',
  FOOD: '당신은 영양·칼로리 전문가 AI입니다. 음식, 영양소, 건강식, 다이어트 관련 질문에 한국어로 3~5문장 이내로 답변하세요.',
  TRAVEL: '당신은 여행 플래너 AI입니다. 여행지, 일정, 숙소, 현지 문화 관련 질문에 한국어로 3~5문장 이내로 답변하세요.',
  CODING: '당신은 소프트웨어 개발 도우미 AI입니다. 프로그래밍, 버그 해결, 아키텍처 질문에 한국어로 간결하게 답변하세요. 코드는 마크다운 코드 블록으로 표시하세요.',
  FITNESS: '당신은 피트니스 트레이너 AI입니다. 운동법, 식단 계획, 근력 강화 관련 질문에 한국어로 3~5문장 이내로 답변하세요.',
  FINANCE: '당신은 재무 상담 AI입니다. 투자, 가계부, 절세 방법을 한국어로 3~5문장 이내로 설명하세요. 구체적 투자 권고는 하지 않습니다.',
  MUSIC: '당신은 음악 전문가 AI입니다. 음악 이론, 악기, 작곡, 음악 추천 질문에 한국어로 3~5문장 이내로 답변하세요.',
  GAMING: '당신은 게임 전문가 AI입니다. 공략, 전략, 캐릭터 빌드, 게임 추천 질문에 한국어로 3~5문장 이내로 답변하세요.',
  BUSINESS: '당신은 비즈니스 컨설턴트 AI입니다. 창업, 마케팅, 경영 전략 질문에 한국어로 3~5문장 이내로 답변하세요.',
  LANGUAGE: '당신은 언어 학습 튜터 AI입니다. 문법, 표현, 번역, 언어 학습 팁을 한국어로 3~5문장 이내로 답변하세요.',
}

const DEFAULT_PROMPT = '당신은 PiChat AI 비서입니다. 모든 질문에 친절하게 한국어로 3~5문장 이내로 답변하세요.'

export function getThemeSystemPrompt(themeCd: string): string {
  return THEME_PROMPTS[themeCd] ?? DEFAULT_PROMPT
}

// "@ai 스윙이 흔들려요" → "스윙이 흔들려요"
export function extractAiQuestion(msgCont: string): string {
  return msgCont.replace(/@ai\s*/gi, '').trim() || '안녕하세요'
}

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

export async function generateAiReply(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  const block = response.content[0]
  if (block.type !== 'text') throw new Error('AI 응답 형식 오류')
  return block.text
}
