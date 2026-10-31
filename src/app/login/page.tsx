import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <AuthFrame title="Masuk ke KopiPass" subtitle="Paket bukti EUDR untuk eksportir kopi">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
