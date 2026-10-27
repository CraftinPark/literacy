// One quiet hue per part of the exercise. Comments take the hue of the part they belong to.
// Full class names are spelled out so Tailwind can find them.
import type { CommentType } from './types'

export type Hue = 'understand' | 'bugs' | 'design' | 'improve'

export const HUE_TEXT: Record<Hue, string> = {
  understand: 'text-sec-understand', bugs: 'text-sec-bugs', design: 'text-sec-design', improve: 'text-sec-improve',
}
export const HUE_BG: Record<Hue, string> = {
  understand: 'bg-sec-understand', bugs: 'bg-sec-bugs', design: 'bg-sec-design', improve: 'bg-sec-improve',
}
export const HUE_STRIPE: Record<Hue, string> = {
  understand: 'border-l-sec-understand', bugs: 'border-l-sec-bugs', design: 'border-l-sec-design', improve: 'border-l-sec-improve',
}
export const COMMENT_HUE: Record<CommentType, Hue> = { bug: 'bugs', question: 'understand', design: 'design', improvement: 'improve' }
