import { Inter, Geist_Mono, Noto_Serif, Raleway, Merriweather } from 'next/font/google'

const merriweather = Merriweather({subsets:['latin'],variable:'--font-serif'})

const ralewayHeading = Raleway({
  subsets: ['latin'],
  variable: '--font-heading',
})

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
