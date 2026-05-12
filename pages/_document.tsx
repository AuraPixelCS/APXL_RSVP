import { Html, Head, Main, NextScript } from "next/document";

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href={`${BP}/favicon.ico`} sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href={`${BP}/favicon-32x32.png`} />
        <link rel="icon" type="image/png" sizes="16x16" href={`${BP}/favicon-16x16.png`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`${BP}/apple-touch-icon.png`} />
        <link rel="icon" type="image/png" sizes="192x192" href={`${BP}/android-chrome-192x192.png`} />
        <link rel="icon" type="image/png" sizes="512x512" href={`${BP}/android-chrome-512x512.png`} />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
