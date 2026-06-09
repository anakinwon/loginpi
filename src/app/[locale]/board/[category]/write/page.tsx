import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCategory, hasMinRole } from '@/lib/board'
import { getSessionUser } from '@/lib/auth-check'
import { PostForm } from '@/components/board/post-form'
import { GalleryPostForm } from '@/components/board/gallery-post-form'

type Props = { params: Promise<{ category: string }> }

export default async function WritePage({ params }: Props) {
  const { category } = await params
  const [ctgr, user, t] = await Promise.all([
    getCategory(category),
    getSessionUser(),
    getTranslations('board'),
  ])

  if (!ctgr || !user || !hasMinRole(user.role, ctgr.wr_min_role_cd)) {
    redirect(`/board/${category}`)
  }

  const isGallery = ctgr.gallery_yn === 'Y' && ctgr.attch_yn === 'Y'

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>{t('writeTitle', { name: ctgr.ctgr_nm })}</h1>
      {isGallery ? (
        <GalleryPostForm category={category} />
      ) : (
        <PostForm category={category} canAttach={ctgr.attch_yn === 'Y'} />
      )}
    </div>
  )
}
