import type { characters as en } from "../en/characters";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.de.integer;

export const characters: typeof en = {
  metaTitle: "Meine Charaktere",
  header: {
    eyebrow: "Konto",
    title: "Meine Charaktere",
    description:
      "Verknüpfe jeden Charakter, den du spielst. Keystar liest Daten ausschließlich über die hier aufgeführten ESI-Scopes.",
    link: "Charakter verknüpfen",
  },
  card: {
    main: "Hauptcharakter",
    noToken: "Kein ESI-Token",
    tokenRevoked: "Token widerrufen",
    scopesMissing: (count: number) => (count === 1 ? `${n(count)} Scope fehlt` : `${n(count)} Scopes fehlen`),
    esiActive: "ESI aktiv",
    corporationFallback: (id: number) => `Corporation ${id}`,
    reauthorise: "Neu autorisieren",
    syncNow: "Jetzt synchronisieren",
    syncNowHint: "Alle Syncs für diesen Charakter jetzt einreihen",
    makeMain: "Zum Hauptcharakter machen",
    remove: "Entfernen",
    removeHint: "Verknüpfung lösen und das Token dieses Charakters widerrufen",
    scopes: "Scopes",
    granted: "erteilt",
    missing: "fehlt",
    corporationScopes: (count: number) => `+ ${n(count)} Corporation-Scope${count === 1 ? "" : "s"}`,
    backgroundSync: "Hintergrund-Sync",
    noJobs: "Noch keine Sync-Jobs – sie erscheinen innerhalb einer Minute, nachdem du Scopes erteilt hast.",
    tokenRefreshed: (when: string) => `Token ${when} erneuert`,
    optional: "Optional",
    optionalOn: "an",
    optionalOff: "aus",
  },
  lostScope: {
    title: (name: string) => `Optionaler Zugriff für ${name} wurde abgeschaltet`,
    before: "Dieser EVE-Login enthielt",
    after:
      "nicht mehr, obwohl der Charakter es vorher hatte: EVE ersetzt bei jedem Login die Scopes eines Charakters. Importierte Daten bleiben erhalten.",
    action: "Wieder einschalten",
  },
  corporationAccess: {
    title: "Corporation-Zugriff",
    subtitle: "Für Directors, Accountants und Station Manager",
    intro:
      "Corporation-Daten wie Mond-Observer stammen aus dem Token eines Mitglieds mit der passenden Rolle im Spiel. Verknüpfe diesen Charakter mit den zusätzlichen Corporation-Scopes:",
    link: "Mit Corporation-Zugriff verknüpfen",
  },
  privacy: {
    title: "Datenschutz",
    subtitle: "Was Keystar speichert",
    encrypted: "Refresh-Tokens werden mit AES-256-GCM verschlüsselt, bevor sie in die Datenbank gelangen.",
    readOnly: "Keystar fragt nur Lese-Scopes an und kann im Spiel nichts ausführen.",
    removal:
      "Wenn du einen Charakter entfernst, wird sein Token gelöscht und bei CCP widerrufen. Der Mining-Verlauf bleibt bei der Corp.",
    wallet:
      "Wallet-Zugriff ist optional und gilt pro Charakter (Mining-GuV → Einstellungen). Importierte Wallet-Transaktionen siehst nur du, und sie werden gelöscht, wenn du den Charakter entfernst.",
    revoke: "Du kannst den Zugriff jederzeit auf der EVE-Online-Website unter „Third-Party Applications“ widerrufen.",
  },
};
