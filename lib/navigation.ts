import type { LucideIcon } from "lucide-react";
import { Home, Search, Columns3, SquarePen, UserRound, BadgeCheck, ChartNoAxesCombined, Trophy, MessagesSquare, LogIn } from "lucide-react";
import type { UserRole } from "@/lib/types";

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const rankingNavigationItem: NavigationItem = { href: "/rankings", label: "랭킹", icon: Trophy };

export const guestNavigation: NavigationItem[] = [
  { href: "/", label: "홈", icon: Home },
  { href: "/discover", label: "기관찾기", icon: Search },
  { href: "/compare", label: "비교", icon: Columns3 },
  rankingNavigationItem,
  { href: "/login", label: "시작", icon: LogIn },
];

export const getNavigation = (role: UserRole): NavigationItem[] => {
  if (role === "TEACHER") {
    return [
      { href: "/", label: "일터홈", icon: Home },
      { href: "/student-records", label: "학생관리", icon: ChartNoAxesCombined },
      { href: "/rankings?tab=workplace", label: "좋은 일터", icon: Trophy },
      { href: "/messages", label: "알림장", icon: MessagesSquare },
      { href: "/my", label: "MY", icon: UserRound },
    ];
  }

  if (role === "PARENT") {
    return [
      { href: "/", label: "홈", icon: Home },
      { href: "/discover", label: "기관찾기", icon: Search },
      { href: "/student-records", label: "성적관리", icon: ChartNoAxesCombined },
      { href: "/messages", label: "알림장", icon: MessagesSquare },
      { href: "/my", label: "MY", icon: UserRound },
    ];
  }

  return [
    { href: "/", label: "홈", icon: Home },
    { href: "/discover", label: role === "STUDENT" ? "학원찾기" : "기관찾기", icon: Search },
    { href: "/compare", label: "비교", icon: Columns3 },
    { href: role === "STUDENT" ? "/activity" : "/review", label: role === "STUDENT" ? "내 활동" : "후기쓰기", icon: role === "STUDENT" ? BadgeCheck : SquarePen },
    { href: "/my", label: "MY", icon: UserRound },
  ];
};
