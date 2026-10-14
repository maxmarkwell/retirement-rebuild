"use client";
import { usePathname } from "next/navigation";
import AppNavigation from "@/components/app-navigation";
export default function AppShell({ children }: { children: React.ReactNode }) {
  const isLogin = usePathname() === "/login";
  return <><AppNavigation /><div className={isLogin ? "min-h-screen" : "min-h-screen pb-20 lg:pl-60 lg:pb-0"}>{children}</div></>;
}
