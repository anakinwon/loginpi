import { parseBlocks } from './gallery-block-utils'

interface Props {
  postCont: string | null | undefined
}

export function GalleryBodyRenderer({ postCont }: Props) {
  const blocks = parseBlocks(postCont)

  return (
    <div className='mb-8 min-h-32 text-sm leading-relaxed'>
      {blocks.map((block, idx) => {
        if (block.t === 'text') {
          if (!block.c.trim()) return null
          return (
            <p key={idx} className='mb-4 whitespace-pre-wrap last:mb-0'>
              {block.c}
            </p>
          )
        }
        if (block.kind !== 'saved') return null
        return (
          <figure key={block.id} className='my-4'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={block.url}
              alt={block.nm}
              className='max-w-full rounded-md'
              loading='lazy'
            />
            {block.nm && (
              <figcaption className='mt-1 text-center text-xs text-muted-foreground'>
                {block.nm}
              </figcaption>
            )}
          </figure>
        )
      })}
    </div>
  )
}
