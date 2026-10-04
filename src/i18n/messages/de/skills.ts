import { FORMATTERS } from "@/lib/format";
import type { skills as en } from "../en/skills";

const n = FORMATTERS.de.integer;
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

export const skills: typeof en = {
  module: {
    scopes: {
      queue: "Liest die Skill-Queue, damit Keystar zeigen kann, was trainiert wird und wann es fertig ist (optional).",
      skills: "Liest trainierte Skills, Skillpunkte und Attribute für die Skill-Seiten (optional).",
      queueLabel: "Zugriff auf die Skill-Queue",
      skillsLabel: "Zugriff auf Skills",
      implants:
        "Liest die Implantate des aktiven Klons, damit der Remap-Optimierer Basisattribute und Implantatboni unterscheiden kann (optional).",
      implantsLabel: "Zugriff auf Implantate",
    },
    jobs: {
      queue: "Skill-Queue",
      character: "Skills und Attribute",
      implants: "Implantate",
    },
    permissionGroup: "Skills",
    permissions: {
      viewOwn: {
        label: "Eigene Skills ansehen",
        description: "Skill-Queues und Attribute deiner eigenen Charaktere.",
      },
      viewCorp: {
        label: "Skills der Corporation ansehen",
        description: "Skill-Queues aller Mitglieder der Heimat-Corporation, die sie teilen.",
      },
    },
    navSection: "Piloten",
    nav: {
      queues: "Skill-Queues",
      remap: "Remap-Optimierer",
    },
  },

  metaTitle: {
    overview: "Skill-Queues",
    settings: "Skill-Zugriff",
    remap: "Remap-Optimierer",
  },
  page: {
    description: "Was deine Charaktere trainieren, wann jeder Skill fertig ist und wie lange die Queues noch laufen.",
    settings: "Zugriff",
    synced: (when: string) => `Aktualisiert ${when}`,
    remapDescription: "Der Neural Remap, mit dem jeder Charakter seine aktuelle Skill-Queue am schnellsten abschließt.",
  },
  view: {
    label: "Wessen Queues",
    own: "Meine Charaktere",
    corp: "Corporation",
    corpHint: "Mitglieder der Heimat-Corporation, die ihre Skill-Queue teilen",
    ownHint: "Nur deine eigenen Charaktere",
  },
  filters: {
    characters: "Charaktere",
  },
  stats: {
    characters: "Charaktere",
    training: "Im Training",
    endingSoon: "Endet in 24 Std.",
    idle: "Pausiert oder leer",
  },
  status: {
    training: "Trainiert",
    "ending-soon": "Endet bald",
    paused: "Pausiert",
    empty: "Queue leer",
    notEnabled: "Nicht geteilt",
    revoked: "Zugriff widerrufen",
    error: "Sync fehlgeschlagen",
  },
  card: {
    totalSp: (sp: string) => `${sp} SP`,
    unallocated: (sp: string) => `${sp} nicht zugewiesen`,
    owner: (name: string) => `Besitzer: ${name}`,
    trainingNow: "Trainiert gerade",
    finishes: (when: string) => `Fertig ${when}`,
    queueEnds: "Queue endet",
    queueLength: "Restzeit",
    queued: (count: number) => plural(count, "Skill in der Queue", "Skills in der Queue"),
    pausedHint: "Das Training ist im Spiel pausiert. Zeiten erscheinen, sobald es weiterläuft.",
    emptyHint: "Es wird nichts trainiert. Füge im Spiel Skills zur Queue hinzu.",
    staleHint: "ESI aktualisiert die Queue beim Einloggen des Charakters; seitdem fertige Skills werden ausgeblendet.",
    waiting: "Warte auf die erste Synchronisierung …",
    notEnabled: "Dieser Charakter teilt seine Skills noch nicht mit Keystar.",
    enable: "Skills teilen",
    showQueue: (count: number) => `Ganze Queue anzeigen (${plural(count, "Skill", "Skills")})`,
    remapLink: "Bester Remap",
  },
  table: {
    position: "#",
    skill: "Skill",
    finishes: "Fertig am",
    timeLeft: "In",
    spLeft: "Fehlende SP",
  },
  attributes: {
    title: "Attribute",
    names: {
      charisma: "Charisma",
      intelligence: "Intelligenz",
      memory: "Gedächtnis",
      perception: "Wahrnehmung",
      willpower: "Willenskraft",
    },
    bonusRemaps: (count: number) => plural(count, "Bonus-Remap", "Bonus-Remaps"),
    remapAvailable: "Jährlicher Remap verfügbar",
    remapFrom: (when: string) => `Nächster jährlicher Remap ${when}`,
    lastRemap: (when: string) => `Letzter Remap ${when}`,
    unknown: "Teile die Skills, um Attribute und Remaps zu sehen.",
  },
  duration: ({ days, hours, minutes }) =>
    days > 0 ? `${days} T. ${hours} Std. ${minutes} Min.` : hours > 0 ? `${hours} Std. ${minutes} Min.` : `${minutes} Min.`,
  empty: {
    own: {
      title: "Keine Charaktere verknüpft",
      body: "Verknüpfe einen Charakter unter Meine Charaktere und teile dann hier seine Skills.",
    },
    corp: {
      title: "Noch niemand teilt seine Skills",
      body: "Mitglieder entscheiden auf der Seite Skill-Zugriff, ob Keystar ihre Skill-Queue lesen darf.",
    },
    filtered: "Kein Charakter passt zum Filter.",
  },
  remap: {
    title: "Empfohlener Remap",
    columns: {
      attribute: "Attribut",
      current: "Jetzt",
      recommended: "Remap auf",
      implants: "Implantate",
    },
    queueNow: "Queue jetzt",
    queueAfter: "Nach dem Remap",
    saved: "Zeitersparnis",
    optimal: "Die aktuellen Attribute sind für diese Queue bereits der beste Remap.",
    howTo: "Remap im Spiel: Charakterbogen → Attribute → Neural Remap. Implantate sind nicht Teil des Remaps und bleiben, wie sie sind.",
    method:
      "Berechnet über die gesamte restliche Queue mit Omega-Trainingsgeschwindigkeit (Primär + Sekundär ÷ 2 SP pro Minute). Jeder gültige Remap wird geprüft: 17–27 pro Attribut, 99 Punkte insgesamt.",
    shortQueue: {
      title: "Queue kürzer als 180 Tage",
      body: (duration: string) =>
        `Mit den empfohlenen Attributen läuft die Queue nur noch ${duration} lang. Ein Remap legt deine Attribute fest: Der jährliche Remap kommt erst nach 365 Tagen wieder und Bonus-Remaps sind nach Gebrauch weg. Plane mindestens 180 Tage Skills mit diesen Attributen, bevor du remappst.`,
      bodyCurrent: (duration: string) =>
        `Mit den aktuellen Attributen läuft die Queue nur noch ${duration} lang. Ein Remap legt deine Attribute fest: Der jährliche Remap kommt erst nach 365 Tagen wieder und Bonus-Remaps sind nach Gebrauch weg. Plane mindestens 180 Tage Skills, bevor du remappst.`,
    },
    availability: {
      now: "Jährlicher Remap jetzt verfügbar",
      yearlyFrom: (when: string) => `Jährlicher Remap ab ${when}`,
      bonus: (count: number) => `${plural(count, "Bonus-Remap", "Bonus-Remaps")} übrig`,
      none: (when: string) => `Vor ${when} ist kein Remap verfügbar; die Empfehlung gilt, sobald einer verfügbar ist.`,
    },
    notes: {
      empty: "Die Queue ist leer: nichts zu optimieren.",
      notShared: "Dieser Charakter gibt Skill-Queue und Attribute nicht frei.",
      waiting: "Warte auf die Synchronisierung von Queue und Attributen …",
      paused: "Das Training ist im Spiel pausiert; die Zeiten werden aus den noch fehlenden SP berechnet.",
      unknownEntries: (count: number) =>
        `${plural(count, "Skill", "Skills")} in der Queue nicht berücksichtigt: Trainingsdaten noch unbekannt.`,
      implantsNotShared:
        "Implantate sind nicht freigegeben, daher werden die Attribute als implantatfrei angenommen. Mit Attributimplantaten liegt die Empfehlung daneben.",
      implantsWaiting: "Implantate sind freigegeben, aber noch nicht gelesen; vorerst wird ohne gerechnet.",
      implantsUncertain:
        "Attribute minus Implantate ergeben keinen gültigen Remap (aktiver Booster oder veraltete Daten?), daher bleiben Implantate außen vor.",
      notComparable: (total: string) =>
        `Die Attribute ergeben ${total} statt 99 Punkte, also bringen Implantate (oder ein Booster) Punkte mit, die Keystar nicht kennt. Sie ändern auch, welcher Remap am schnellsten ist, daher gibt es keine Empfehlung: Gib die Implantate frei, um eine zu bekommen.`,
      shareImplants: "Implantate freigeben",
    },
    empty: {
      title: "Kein Charakter zum Optimieren",
      body: "Gib die Skills eines Charakters auf der Seite Skill-Zugriff frei, um Remap-Empfehlungen für seine Queue zu bekommen.",
    },
  },
  settings: {
    description: "Lege für jeden Charakter fest, ob Keystar seine Skill-Queue, Skills und Attribute lesen darf.",
    title: "Skill-Zugriff pro Charakter",
    subtitle: "Beim Teilen wird der Charakter bei EVE neu autorisiert und um die beiden Skill-Scopes ergänzt.",
    on: "Geteilt",
    off: "Nicht geteilt",
    revoked: "Token widerrufen",
    partial: "Teilweise geteilt",
    enable: "Skills teilen",
    stop: "Nicht mehr teilen",
    reauthorize: "Neu autorisieren",
    demo: "Im Demo-Modus nicht verfügbar",
    lastSync: (when: string) => `Zuletzt aktualisiert ${when}`,
    firstSync: "Die erste Aktualisierung läuft in den nächsten Minuten.",
    nothing: "Nichts gespeichert.",
    kept: "Skill-Daten von früher sind noch gespeichert.",
    deleteData: "Skill-Daten löschen",
    deleteDataHint: "Entfernt die gespeicherte Queue, Skills und Attribute dieses Charakters aus Keystar.",
    sharingLabel: "Skill-Freigabe",
    implants: {
      shared: "Implantate für den Remap-Optimierer freigegeben.",
      hint: "Gib auch die Implantate frei, damit der Remap-Optimierer deine Basisattribute genau kennt.",
      enable: "Implantate freigeben",
    },
    toast: {
      deleted: (name: string) => `Gespeicherte Skills von ${name} gelöscht`,
      failed: (name: string) => `Skills von ${name} konnten nicht gelöscht werden`,
      errors: {
        forbidden: "Du hast keinen Zugriff mehr auf Skills in Keystar.",
        notOwned: "Dieser Charakter ist nicht mehr mit deinem Konto verknüpft.",
        stillSharing: "Beende zuerst das Teilen der Skills für diesen Charakter.",
        unknown: "Etwas ist schiefgelaufen. Lade die Seite neu und versuche es noch einmal.",
      },
    },
    notes: {
      corp: "Direktoren und alle anderen, die Corporation-Skills sehen dürfen, sehen die Queues geteilter Charaktere deiner Heimat-Corporation.",
      stop: "Beenden schaltet das Teilen in Keystar sofort ab; gespeicherte Daten bleiben, bis du sie löschst. Autorisiere den Charakter unter Meine Charaktere neu, um die Scopes auch aus seinem EVE-Token zu entfernen.",
    },
  },
};
