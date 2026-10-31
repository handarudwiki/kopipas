import type { Metadata } from "next";
import { ROLE_LABEL } from "@/lib/auth/rbac";
import { inviteInfo } from "@/server/auth";
import { AuthFrame } from "@/components/auth-frame";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Terima undangan" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const info = await inviteInfo(token);
  if (!info) {
    return (
      <AuthFrame title="Undangan tidak valid" subtitle="Tautan undangan sudah dipakai atau kedaluwarsa. Minta admin organisasi mengirim ulang.">
        <a href="/login" className="btn-secondary w-full">Ke halaman masuk</a>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={`Bergabung ke ${info.orgName}`} subtitle={`${info.email} · ${ROLE_LABEL[info.role]}`}>
      <AcceptForm token={token} name={info.name} />
    </AuthFrame>
  );
}
