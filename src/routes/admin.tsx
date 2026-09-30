import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isAdmin, adminLogout } from "@/lib/admin-session";
import { AdminLogin } from "@/components/AdminLogin";
import { Button } from "@/components/ui/button";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { LogOut, LayoutDashboard, FileText, Users, ClipboardCheck, BarChart3, Inbox, AlertTriangle, Image as ImageIcon, Settings, FileUp } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/exams", label: "Mitihani", icon: FileText },
  { to: "/admin/students", label: "Wanafunzi", icon: Users },
  { to: "/admin/attendance", label: "Mahudhurio", icon: ClipboardCheck },
  { to: "/admin/submissions", label: "Matokeo", icon: BarChart3 },
  { to: "/admin/pdf", label: "PDF Majibu", icon: FileUp },
  { to: "/admin/requests", label: "Maombi", icon: Inbox },
  { to: "/admin/issues", label: "Changamoto", icon: AlertTriangle },
  { to: "/admin/gallery", label: "Bana", icon: ImageIcon },
  { to: "/admin/settings", label: "Mipangilio", icon: Settings },
];

function AdminSidebar({ onLogout }: { onLogout: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <Sidebar collapsible="icon" className="border-r border-primary/15">
      <SidebarContent className="bg-card/85 backdrop-blur-2xl">
        <SidebarGroup>
          <SidebarGroupLabel className="text-primary font-bold">
            {!collapsed && "⚡ Admin Panel"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <Link
                      to={item.to}
                      activeOptions={{ exact: !!item.exact }}
                       className="flex items-center gap-3 rounded-lg transition-all hover:bg-primary/15"
                       activeProps={{ className: "flex items-center gap-3 rounded-lg bg-primary text-primary-foreground font-bold shadow-md" }}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onLogout} tooltip="Toka" className="text-destructive hover:bg-destructive/10">
                  <LogOut className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Toka</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function AdminLayout() {
  const nav = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setAuthed(isAdmin()); setReady(true); }, []);
  if (!ready) return null;
  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;
  return (
    <SidebarProvider>
      <div className="page-shell flex min-h-screen w-full bg-background/80">
        <AdminSidebar onLogout={() => { adminLogout(); nav({ to: "/" }); }} />
        <div className="flex-1 flex flex-col min-w-0">
          <AnnouncementBanner />
          <header className="sticky top-0 z-30 flex h-14 items-center border-b border-primary/15 bg-card/75 px-2 shadow-soft backdrop-blur-2xl">
            <SidebarTrigger className="hover:bg-primary/15 rounded-lg" />
            <span className="ml-3 font-display font-bold text-foreground">Admin Panel</span>
          </header>
          <main className="container mx-auto flex-1 px-4 py-6 md:py-8"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}