"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, Download, MapPin, Menu, Share2, Smartphone, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/app-context";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getNavigation, guestNavigation, rankingNavigationItem } from "@/lib/navigation";
import { roleLabels, zoneLabels } from "@/lib/labels";
import { Brand } from "@/components/brand";
import styles from "./app-shell.module.css";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const personalPaths = [
  "/activity",
  "/admin",
  "/institution-manager",
  "/messages",
  "/my",
  "/review",
  "/school-record",
  "/student-records",
  "/subscription",
  "/teacher-log",
  "/trust-center",
] as const;

function isPersonalPath(pathname: string) {
  return personalPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, zone, setZone, comparison, hydrated, onboardingComplete, accountAuthStatus } = useApp();
  const accountConfigured = isSupabaseConfigured();
  const personalized = onboardingComplete && (!accountConfigured || accountAuthStatus === "authenticated");
  const navigation = useMemo(() => personalized ? getNavigation(role) : guestNavigation, [personalized, role]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const installDialogRef = useRef<HTMLElement>(null);
  const installReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handlePreferenceError = (event: Event) => setPreferenceError((event as CustomEvent<string>).detail);
    window.addEventListener("edutalk:preference-error", handlePreferenceError);
    return () => window.removeEventListener("edutalk:preference-error", handlePreferenceError);
  }, []);

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const frame = window.requestAnimationFrame(() => {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true);
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    });
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallHelpOpen(false);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!installHelpOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInstallHelpOpen(false);
        installReturnFocusRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = installDialogRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    installDialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [installHelpOpen]);

  const startInstall = async () => {
    installReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMenuOpen(false);
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome !== "accepted") setInstallHelpOpen(true);
  };

  const closeInstallHelp = () => {
    setInstallHelpOpen(false);
    window.requestAnimationFrame(() => installReturnFocusRef.current?.focus());
  };

  useEffect(() => {
    if (hydrated && !personalized && isPersonalPath(pathname)) {
      router.replace("/login");
    }
  }, [hydrated, personalized, pathname, router]);

  if (pathname === "/onboarding" || pathname === "/login") {
    return <>{children}</>;
  }

  if (!hydrated || (!personalized && isPersonalPath(pathname))) {
    return <main className={styles.onboardingRedirect} aria-busy="true">계정 설정 화면을 준비하고 있어요.</main>;
  }

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar} aria-label="주요 메뉴">
        <Brand />
        <div className={styles.roleBadge}>{personalized ? `${roleLabels[role]} 모드` : "게스트 둘러보기"}</div>
        <nav className={styles.sideNav}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? styles.sideLinkActive : styles.sideLink}>
                <Icon size={21} strokeWidth={active ? 2.3 : 1.8} aria-hidden />
                <span>{item.label}</span>
                {item.href === "/compare" && comparison.length > 0 ? <b>{comparison.length}</b> : null}
              </Link>
            );
          })}
        </nav>
        <Link href="/tutors" className={styles.tutorCta}>
          내 동네 튜터 찾기
          <span>동탄 이웃과 연결해요</span>
        </Link>
        {!installed ? <button type="button" className={styles.installCta} onClick={() => void startInstall()}><Download size={18} aria-hidden /><span><strong>EDU톡 앱 설치</strong><small>홈 화면에서 바로 열어요</small></span></button> : null}
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.mobileBrand}><Brand compact /></div>
          <label className={styles.zoneSelect}>
            <MapPin size={18} aria-hidden />
            <span className="sr-only">관심 지역</span>
            <select value={zone} onChange={(event) => setZone(event.target.value as typeof zone)}>
              <option value="DONGTAN_2">{zoneLabels.DONGTAN_2}</option>
              <option value="DONGTAN_1">{zoneLabels.DONGTAN_1}</option>
              <option value="ALL">{zoneLabels.ALL}</option>
            </select>
            <ChevronDown size={15} aria-hidden />
          </label>
          <div className={styles.headerActions}>
            <span className={styles.demoBadge}>{personalized ? accountConfigured ? "계정 연결" : "체험 모드" : "게스트"}</span>
            <Link href={personalized ? "/activity" : "/login"} className={styles.iconButton} aria-label={personalized ? "알림과 내 활동" : "로그인·체험 시작"}>
              <Bell size={21} />
            </Link>
            <button className={styles.menuButton} onClick={() => setMenuOpen((open) => !open)} aria-label="전체 메뉴" aria-expanded={menuOpen}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </header>

        {menuOpen ? (
          <nav className={styles.mobileMenu} aria-label="전체 메뉴">
            <Link href="/rankings?tab=workplace" onClick={() => setMenuOpen(false)}>좋은 일터·익명 후기</Link>
            <Link href={rankingNavigationItem.href} onClick={() => setMenuOpen(false)}>{rankingNavigationItem.label}</Link>
            {personalized && (role === "PARENT" || role === "TEACHER") ? (
              <Link href="/messages" onClick={() => setMenuOpen(false)}>선생님·학부모 알림장</Link>
            ) : null}
            <Link href="/tutors" onClick={() => setMenuOpen(false)}>개인 튜터</Link>
            <Link href="/policies" onClick={() => setMenuOpen(false)}>정책·행사</Link>
            <Link href="/compare" onClick={() => setMenuOpen(false)}>기관 비교</Link>
            <Link href="/legal/terms" onClick={() => setMenuOpen(false)}>이용약관 초안</Link>
            <Link href="/legal/privacy" onClick={() => setMenuOpen(false)}>개인정보 처리방침 초안</Link>
            <Link href="/legal/community" onClick={() => setMenuOpen(false)}>커뮤니티 정책 초안</Link>
            <Link href="/support" onClick={() => setMenuOpen(false)}>고객센터</Link>
            {!installed ? <button type="button" onClick={() => void startInstall()}><Download size={18} aria-hidden />EDU톡 앱 설치</button> : null}
            {personalized ? <Link href="/review" onClick={() => setMenuOpen(false)}>후기 쓰기</Link> : null}
            {personalized ? <Link href="/trust-center" onClick={() => setMenuOpen(false)}>인증·정보정정·신고</Link> : null}
            {personalized && role === "TEACHER" ? <Link href="/school-record" onClick={() => setMenuOpen(false)}>AI 생기부 초안</Link> : null}
            {!personalized ? <Link href="/login" onClick={() => setMenuOpen(false)}>로그인·체험 시작</Link> : null}
            {personalized && process.env.NEXT_PUBLIC_DATA_MODE !== "production" ? <Link href="/admin" onClick={() => setMenuOpen(false)}>운영 화면</Link> : null}
          </nav>
        ) : null}

        <div className={styles.content}>{preferenceError ? <div className={styles.preferenceError} role="alert"><span>{preferenceError}</span><button type="button" onClick={() => setPreferenceError("")}>닫기</button></div> : null}{children}<footer className={styles.legalFooter}><Link href="/legal/terms">이용약관 초안</Link><Link href="/legal/privacy">개인정보 처리방침 초안</Link><Link href="/legal/community">커뮤니티 정책 초안</Link><Link href="/account-deletion">계정 삭제 요청</Link><Link href="/support">고객센터</Link></footer></div>
      </div>

      <nav className={styles.bottomNav} aria-label="하단 메뉴">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? styles.bottomLinkActive : styles.bottomLink}>
              <span className={styles.bottomIcon}>
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                {item.href === "/compare" && comparison.length > 0 ? <b>{comparison.length}</b> : null}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {installHelpOpen ? <div className={styles.installBackdrop} role="presentation">
        <section ref={installDialogRef} className={styles.installDialog} role="dialog" aria-modal="true" aria-labelledby="install-dialog-title">
          <div className={styles.installDialogHeader}><span><Smartphone size={22} aria-hidden /></span><button type="button" onClick={closeInstallHelp} aria-label="설치 안내 닫기"><X size={22} aria-hidden /></button></div>
          <h2 id="install-dialog-title">EDU톡을 홈 화면에 설치하세요</h2>
          <p>{isIos ? "Safari 하단의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하면 앱처럼 바로 열 수 있어요." : "브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하면 앱처럼 바로 열 수 있어요."}</p>
          <div className={styles.installSteps}><Share2 size={19} aria-hidden /><span>{isIos ? "공유 버튼 → 홈 화면에 추가 → 추가" : "브라우저 메뉴 → 앱 설치 → 설치"}</span></div>
          <p className={styles.installNote}>설치해도 계정 데이터와 공개 범위는 동일하게 유지됩니다.</p>
          <button type="button" className={styles.installClose} onClick={closeInstallHelp}>확인했어요</button>
        </section>
      </div> : null}
    </div>
  );
}
