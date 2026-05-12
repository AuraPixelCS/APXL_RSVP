import { useEffect } from "react";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import PublicLayout from "@/components/layout/PublicLayout";
import LoginForm from "@/components/sections/LoginForm";
import { useAuthContext } from "@/contexts/AuthContext";

const LoginPage: NextPageWithLayout = () => {
  const { user, loading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/admin");
    }
  }, [user, loading, router]);

  if (loading || user) return null;

  return <LoginForm />;
};

LoginPage.getLayout = (page: ReactElement) => (
  <PublicLayout title="Admin Login — AuraPixel RSVP">{page}</PublicLayout>
);

export default LoginPage;
