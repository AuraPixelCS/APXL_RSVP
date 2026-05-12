import { ReactNode } from "react";
import Head from "next/head";

interface PublicLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function PublicLayout({
  children,
  title = "AuraPixel RSVP",
}: PublicLayoutProps) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        {children}
      </div>
    </>
  );
}
