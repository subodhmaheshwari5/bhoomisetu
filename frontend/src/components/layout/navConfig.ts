import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Map,
  FileStack,
  Banknote,
  HomeIcon,
  MessageSquareWarning,
  FolderKanban,
  BarChart3,
  FileBarChart,
  Bell,
  Users,
  Landmark,
  MapPinned,
  Briefcase,
  Settings,
  ScrollText,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const GOVERNMENT_DASHBOARD_NAV: NavItem[] = [
  { label: "Overview", path: "/dashboard", icon: LayoutDashboard },
  { label: "Land Map", path: "/dashboard/map", icon: Map },
  { label: "Acquisition Cases", path: "/dashboard/cases", icon: FileStack },
  { label: "Compensation", path: "/dashboard/compensation", icon: Banknote },
  { label: "Rehabilitation & Resettlement", path: "/dashboard/rehabilitation", icon: HomeIcon },
  { label: "Grievances", path: "/dashboard/grievances", icon: MessageSquareWarning },
  { label: "Documents", path: "/dashboard/documents", icon: FolderKanban },
  { label: "Analytics", path: "/dashboard/analytics", icon: BarChart3 },
  { label: "Reports", path: "/dashboard/reports", icon: FileBarChart },
  { label: "Notifications", path: "/dashboard/notifications", icon: Bell },
];

export const ADMINISTRATION_NAV: NavItem[] = [
  { label: "Users", path: "/dashboard/admin/users", icon: Users },
  { label: "States", path: "/dashboard/admin/states", icon: Landmark },
  { label: "Districts", path: "/dashboard/admin/districts", icon: MapPinned },
  { label: "Projects", path: "/dashboard/admin/projects", icon: Briefcase },
  { label: "System Settings", path: "/dashboard/admin/settings", icon: Settings },
  { label: "Audit Logs", path: "/dashboard/admin/audit-logs", icon: ScrollText },
];
