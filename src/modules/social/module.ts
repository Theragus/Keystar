import { Mail } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const MAIL_SCOPE = "esi-mail.read_mail.v1";
export const MAIL_JOB_KEY = "social.character-mail";
export const CALENDAR_SCOPE = "esi-calendar.read_calendar_events.v1";
export const CALENDAR_JOB_KEY = "social.character-calendar";

export const SOCIAL_PERMISSIONS = {
  mail: "social.mail",
} as const;

/**
 * Social: what ESI groups under `char-social` (mail and calendar; contacts
 * and standings would share its rate budget). Mail is private, so the scope is
 * opt-in per character and mail is only ever shown to the account that owned
 * the character when it was imported. Read-only: Keystar never changes mail.
 * The calendar is opt-in too and only keeps corporation and alliance events,
 * which mining ops are created from (managed on the mining ops page).
 */
export const socialModule: KeystarModule = {
  id: "social",
  name: "Social",
  description: "EVE mail of characters whose owner opts in, read-only.",
  scopes: [
    {
      scope: MAIL_SCOPE,
      level: "character",
      optional: true,
      manageHref: "/mail",
      managePermission: SOCIAL_PERMISSIONS.mail,
      reason: (t) => t.social.module.scopes.readMail,
      label: (t) => t.social.module.scopes.readMailLabel,
    },
    {
      scope: CALENDAR_SCOPE,
      level: "character",
      optional: true,
      manageHref: "/mining/ops",
      managePermission: "mining.ops.manage",
      reason: (t) => t.social.module.scopes.readCalendar,
      label: (t) => t.social.module.scopes.readCalendarLabel,
    },
  ],
  permissions: [
    {
      key: SOCIAL_PERMISSIONS.mail,
      label: (t) => t.social.module.permissions.mail.label,
      description: (t) => t.social.module.permissions.mail.description,
      group: (t) => t.social.module.permissionGroup,
      defaultMinRole: "member",
    },
  ],
  alerts: [
    {
      id: "social.mail",
      label: (t) => t.social.module.alerts.mail.label,
      hint: (t) => t.social.module.alerts.mail.hint,
      anyPermission: [SOCIAL_PERMISSIONS.mail],
    },
  ],
  nav: [
    {
      id: "social",
      label: (t) => t.social.module.navSection,
      order: 30,
      tone: "social",
      items: [{ href: "/mail", label: (t) => t.social.module.nav.mail, icon: Mail, anyPermission: [SOCIAL_PERMISSIONS.mail] }],
    },
  ],
};
