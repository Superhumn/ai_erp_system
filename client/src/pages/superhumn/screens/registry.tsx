import type { ComponentType } from "react";
import Home from "./Home";
import Projects from "./Projects";
import TaskList from "./TaskList";
import Meetings from "./Meetings";
import Messaging from "./Messaging";
import EmailInbox from "./EmailInbox";
import Orders from "./Orders";
import CRM from "./CRM";
import Marketing from "./Marketing";
import CX from "./CX";
import Finance from "./Finance";
import Approvals from "./Approvals";
import Fundraising from "./Fundraising";
import Grants from "./Grants";
import Investors from "./Investors";
import DataRooms from "./DataRooms";
import Inventory from "./Inventory";
import Manufacturing from "./Manufacturing";
import Procurement from "./Procurement";
import Logistics from "./Logistics";
import HR from "./HR";
import Recruiting from "./Recruiting";
import Legal from "./Legal";
import SOPs from "./SOPs";
import Import from "./Import";
import EDI from "./EDI";
import Settings from "./Settings";
import Login from "./Login";
import AIEverywhere from "./AIEverywhere";

export type ScreenEntry = {
  badge: string;
  title: string;
  Component: ComponentType;
};

/**
 * Canonical screens registry, in nav order. Add a screen here once it is
 * ported and it appears in the gallery automatically. Badges keep their
 * original design-exploration ids (see the handoff README module map).
 */
export const SCREENS: ScreenEntry[] = [
  { badge: "14a", title: "Home — needs-you queue, today & live operations", Component: Home },
  { badge: "7a", title: "Projects — portfolio + milestones panel", Component: Projects },
  { badge: "8a", title: "Projects: task list — grouped tasks, 2 columns", Component: TaskList },
  { badge: "10a", title: "Meetings", Component: Meetings },
  { badge: "10b", title: "Messaging", Component: Messaging },
  { badge: "7d", title: "Email inbox", Component: EmailInbox },
  { badge: "6a", title: "Orders", Component: Orders },
  { badge: "5c", title: "CRM", Component: CRM },
  { badge: "13b", title: "Marketing — KPI sparklines, leads-by-channel trends", Component: Marketing },
  { badge: "10d", title: "CX / Support", Component: CX },
  { badge: "6b", title: "Finance", Component: Finance },
  { badge: "6c", title: "Approvals", Component: Approvals },
  { badge: "6d", title: "Fundraising", Component: Fundraising },
  { badge: "10f", title: "Grants", Component: Grants },
  { badge: "10g", title: "Investors", Component: Investors },
  { badge: "9c", title: "Data Rooms", Component: DataRooms },
  { badge: "5a", title: "Inventory — product-first, no vendor column", Component: Inventory },
  { badge: "9a", title: "Manufacturing — work orders + BOM panel", Component: Manufacturing },
  { badge: "5b", title: "Procurement", Component: Procurement },
  { badge: "11e/12e/13a", title: "Logistics — one page, three toggle views", Component: Logistics },
  { badge: "7b", title: "HR", Component: HR },
  { badge: "10e", title: "Recruiting — LinkedIn paste-to-import side panel", Component: Recruiting },
  { badge: "7c", title: "Legal", Component: Legal },
  { badge: "10h", title: "SOPs", Component: SOPs },
  { badge: "10i", title: "Import", Component: Import },
  { badge: "10j", title: "EDI", Component: EDI },
  { badge: "9b", title: "Settings", Component: Settings },
  { badge: "9d", title: "Login", Component: Login },
  { badge: "5d", title: "AI Everywhere — ambient AI pattern reference", Component: AIEverywhere },
];
