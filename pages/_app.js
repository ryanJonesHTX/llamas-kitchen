import Head from 'next/head'
import '../styles/globals.css'
import { useRouter } from 'next/router'

function MyApp({ Component, pageProps }) {
  const router = useRouter()
  return (
    <>
      <Head>
        <link rel="icon" href="/images/favicon.ico" />
        {/* <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/images/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/images/favicon-16x16.png"
        /> */}
      </Head>
      {router.pathname === '/' ? (
        <>
          <Component {...pageProps} />
        </>
      ) : (
        <>
          <Component {...pageProps} />
        </>
      )}
    </>
  )
}

export default MyApp
