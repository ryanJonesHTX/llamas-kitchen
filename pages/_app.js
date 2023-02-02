import Head from 'next/head'
import Link from 'next/link'
import '../styles/globals.css'
import Nav from '../components/Nav'
import { useRouter } from "next/router";


function MyApp({ Component, pageProps }) {
  const router = useRouter();
  return (
    <>
     {router.pathname === "/" ? (
         <>
         <Component {...pageProps} />
        </>
     ) : (
      <>
        <Nav />
        <Component {...pageProps} />
      </>
     )}
    </>

  )
}

export default MyApp


{/* <Head>
<title>Llamas Kitchen</title>
</Head> */}