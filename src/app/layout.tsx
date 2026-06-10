import { Inter, Geist_Mono, Noto_Serif, Raleway } from "next/font/google";

const notoSerif = Noto_Serif({subsets:['latin'],variable:'--font-serif'});

const ralewayHeading = Raleway({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
