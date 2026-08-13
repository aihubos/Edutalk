import { redirect } from "next/navigation";
import { AuthEntryPanel } from "@/components/auth-entry-panel";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "./login.module.css";

export default async function LoginPage() {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) {
      const [{ data: consent }, { data: profiles }] = await Promise.all([
        supabase.from("user_consents").select("user_id").eq("user_id", data.claims.sub).maybeSingle(),
        supabase.from("user_role_profiles").select("role").eq("user_id", data.claims.sub).limit(1),
      ]);
      redirect(consent && profiles?.length ? "/" : "/onboarding");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>EDU톡 시작하기</p>
        <h1>내 역할에 맞는<br />교육 정보를 준비해요</h1>
        <p>계정을 연결하면 역할 설정과 인증 흐름을 이어갈 수 있어요.</p>
      </section>
      <AuthEntryPanel />
    </main>
  );
}
