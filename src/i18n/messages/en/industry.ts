import { FORMATTERS } from "@/lib/format";
import type { IndustryActivity, JobPhase, JobState, JobStatus } from "@/modules/industry/activities";

const n = FORMATTERS.en.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

/** Industry module: industry jobs of the viewer's own characters. */
export const industry = {
  module: {
    scopes: {
      jobs: "Reads your industry jobs (manufacturing, research, copying, invention, reactions) and when they finish.",
      structures: "Names the player structures your industry jobs run in.",
    },
    jobs: {
      characterJobs: "Industry jobs",
    },
    permissionGroup: "Industry",
    permissions: {
      viewOwn: {
        label: "View own industry jobs",
        description: "Industry jobs of your own characters, with progress and completion times.",
      },
    },
    nav: {
      jobs: "Industry Jobs",
    },
  },

  metaTitle: "Industry jobs",
  page: {
    description: "What your characters are building, researching, copying and inventing, and when each job is done.",
    synced: (when: string) => `Updated ${when}`,
  },

  states: {
    running: { label: "Running", hint: "Installed, paused or waiting to be delivered" },
    finished: { label: "Finished", hint: "Delivered, cancelled or reverted (ESI keeps 90 days)" },
    all: { label: "All", hint: "Every job Keystar has seen" },
  } satisfies Record<JobState, { label: string; hint: string }>,

  activities: {
    manufacturing: "Manufacturing",
    te_research: "Time efficiency research",
    me_research: "Material efficiency research",
    copying: "Copying",
    invention: "Invention",
    reaction: "Reactions",
    other: "Other",
  } satisfies Record<IndustryActivity, string>,
  /** Short activity labels for the table badges. */
  activityShort: {
    manufacturing: "Build",
    te_research: "TE",
    me_research: "ME",
    copying: "Copy",
    invention: "Invent",
    reaction: "React",
    other: "Other",
  } satisfies Record<IndustryActivity, string>,

  statuses: {
    active: "Running",
    paused: "Paused",
    ready: "Ready",
    delivered: "Delivered",
    cancelled: "Cancelled",
    reverted: "Reverted",
  } satisfies Record<JobStatus, string>,
  phases: {
    running: "Running",
    "ending-soon": "Ends soon",
    ready: "Ready to deliver",
    paused: "Paused",
    finished: "Finished",
  } satisfies Record<JobPhase, string>,

  filters: {
    state: "Jobs",
    characters: "Characters",
    activity: "Activity",
    system: "System",
    location: "Station",
    reset: "Reset filters",
    unknownLocation: (id: number) => `Structure ${n(id)}`,
  },

  stats: {
    running: "Running",
    ready: "Ready to deliver",
    endingSoon: "Ending within 24 h",
    jobs: "Jobs shown",
    cost: "Installation costs",
    costHint: "Fees and facility taxes of the jobs shown",
    paused: (count: number) => plural(count, "paused", "paused"),
    lastEnds: (when: string) => `Last one finishes ${when}`,
    byActivity: "By activity",
  },

  table: {
    title: "Jobs",
    character: "Character",
    activity: "Activity",
    blueprint: "Blueprint",
    product: "Product",
    runs: "Runs",
    location: "Location",
    progress: "Progress",
    ends: "Ends",
    status: "Status",
    cost: "Cost",
    runsOf: (done: number, runs: number) => `${n(done)} of ${n(runs)}`,
    probability: (pct: string) => `${pct} chance`,
    pageOf: (page: number, pages: number) => `Page ${n(page)} of ${n(pages)}`,
    previous: "Previous",
    next: "Next",
    noLocation: "Unknown structure",
    noLocationHint: "This structure could not be named: the character has no docking access there, or it is gone.",
    completedBy: (name: string) => `Delivered by ${name}`,
    ago: (when: string) => `finished ${when}`,
  },
  duration: ({ days, hours, minutes }: { days: number; hours: number; minutes: number }) =>
    days > 0 ? `${days}d ${hours}h ${minutes}m` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,

  coverage: {
    title: "Coverage",
    subtitle: "Which of your characters report their jobs",
    tracked: "Characters tracked",
    missingScope: "Missing the industry scope",
    missingScopeHint: "Re-authorise these characters on My Characters to see their jobs.",
    invalidTokens: "Revoked ESI tokens",
    lastSync: "Last update",
    note: "ESI lists a job as running until its installer opens the industry window; Keystar shows a job whose end time has passed as ready to deliver.",
  },

  empty: {
    noCharacters: {
      title: "No characters linked",
      body: "Link a character on My Characters; its industry jobs appear here after the first update.",
      action: "My Characters",
    },
    noJobs: {
      title: "No industry jobs yet",
      body: "None of your characters has an industry job on record. Jobs show up a few minutes after they are installed in game.",
    },
    filtered: "No job matches the filters.",
  },
};
