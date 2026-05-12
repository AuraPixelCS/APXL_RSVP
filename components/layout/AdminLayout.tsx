import { ReactNode, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Sidebar from "./Sidebar";
import Header from "./Header";
import PageTransition from "./PageTransition";
import { useAuthContext } from "@/contexts/AuthContext";

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function AdminLayout({ children, title = "Admin — AuraPixel RSVP" }: AdminLayoutProps) {
  const { user, loading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/admin/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen flex bg-background">
        <Sidebar />
        <div
          className="flex flex-col flex-1 min-w-0"
          style={{ marginLeft: "var(--sidebar-width)" }}
        >
          <Header />
          <PageTransition routeKey={router.pathname}>
            <main className="flex-1 p-6 overflow-auto">
              {children}
            </main>
          </PageTransition>
        </div>
      </div>
    </>
  );
}
