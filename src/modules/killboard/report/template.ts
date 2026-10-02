import type { ReadinessLevel, ReportFacts, SituationReport } from "./types";

/**
 * Deterministic situation report, used when no Claude API key is configured
 * or the API call fails. Pure: same facts, same report.
 */

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith("s") ? `${word}es` : `${word}s`}`;

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function readinessOf(f: ReportFacts): { level: ReadinessLevel; label: string; assessment: string } {
  const { kills, losses } = f.week;
  const eff = f.week.efficiency === null ? null : parseFloat(f.week.efficiency);
  if (kills + losses === 0) {
    return { level: "quiet", label: "NO CONTACT", assessment: "No engagements recorded this cycle. Fleets are standing down." };
  }
  if ((eff !== null && eff < 50) || losses > kills) {
    return {
      level: "strained",
      label: "LOSSES OUTPACING GAINS",
      assessment: "The corporation is trading poorly. Review doctrines and engagement choices before the next push.",
    };
  }
  if (f.change.kills > 0 && kills >= Math.max(5, f.previousWeek.kills * 1.25)) {
    return {
      level: "surging",
      label: "OPERATIONAL TEMPO RISING",
      assessment: "Activity is well above the previous cycle and the exchange rate is holding. Keep the pressure on.",
    };
  }
  if (kills < 5) {
    return { level: "quiet", label: "LOW ACTIVITY", assessment: "Only sporadic contact this cycle." };
  }
  return { level: "steady", label: "NOMINAL", assessment: "Combat tempo is at baseline. Hold the line." };
}

export function templateReport(f: ReportFacts): SituationReport {
  const corp = f.corporation.name;
  const readiness = readinessOf(f);
  const { week, previousWeek, change } = f;

  if (week.kills + week.losses === 0) {
    return {
      headline: `${corp}: quiet week in the theatre`,
      paragraphs: [
        `No kills or losses were recorded for ${corp} between ${f.window.label} YC${f.window.yc}` +
          (previousWeek.kills + previousWeek.losses > 0
            ? `, after ${plural(previousWeek.kills, "kill")} and ${plural(previousWeek.losses, "loss")} the week before.`
            : "."),
      ],
      readiness,
    };
  }

  const headline =
    change.kills > 0
      ? `${corp} steps up the offensive`
      : change.kills < 0
        ? `${corp}: operational tempo cools`
        : `${corp} holds its pace`;

  const effText =
    week.efficiency === null
      ? ""
      : change.efficiencyPoints === null
        ? ` ISK efficiency stood at **${week.efficiency}**.`
        : ` ISK efficiency ${change.efficiencyPoints >= 0 ? "rose" : "fell"} to **${week.efficiency}** (from ${previousWeek.efficiency}).`;

  const p1 =
    `${corp} recorded {+${plural(week.kills, "confirmed kill")}} against {-${plural(week.losses, "loss")}} this cycle` +
    ` — ${signed(change.kills)} kills and ${signed(change.losses)} losses compared with ${f.previousWindow.label}.` +
    ` Hostile assets destroyed: {+${week.iskDestroyed} ISK}; material losses: {-${week.iskLost} ISK}.${effText}`;

  const sentences: string[] = [];
  const [lead, ...rest] = f.topPilots;
  if (lead) {
    const fb = lead.finalBlows ? `, landing ${plural(lead.finalBlows, "final blow")}` : "";
    sentences.push(`{@${lead.name}} led the board with {+${plural(lead.kills, "kill")}}${fb}.`);
    const mover = [...rest].sort((a, b) => b.kills - b.previousKills - (a.kills - a.previousKills))[0];
    const others = rest.slice(0, 3).filter((p) => p !== mover);
    if (mover && mover.kills > mover.previousKills) {
      sentences.push(`{@${mover.name}} posted the biggest gain ({+${signed(mover.kills - mover.previousKills)} kills}).`);
    }
    if (others.length) sentences.push(`${joinNames(others.map((p) => `{@${p.name}}`))} also contributed.`);
  }
  const ship = [...f.topShips].sort((a, b) => b.change - a.change)[0];
  if (ship && ship.change > 0) {
    sentences.push(`The **${ship.name}** saw the strongest growth in deployment ({+${signed(ship.change)}} kills).`);
  } else if (f.topShips[0]) {
    sentences.push(`The **${f.topShips[0].name}** remained the workhorse hull with ${plural(f.topShips[0].kills, "kill")}.`);
  }

  const theatre: string[] = [];
  if (f.killSystems[0]) {
    theatre.push(`Primary theatre of operations: **${f.killSystems[0].name}** with ${plural(f.killSystems[0].kills, "kill")}.`);
  }
  if (f.lossSystems[0]) {
    theatre.push(`Heaviest losses were taken in **${f.lossSystems[0].name}** (${f.lossSystems[0].losses}).`);
  }
  if (f.biggestKill) {
    const k = f.biggestKill;
    const by = k.finalBlow ? `, final blow by {@${k.finalBlow}}` : "";
    theatre.push(`Prize of the week: a **${k.ship}** worth {+${k.value} ISK} in ${k.system}${by}.`);
  }
  if (f.biggestLoss) {
    theatre.push(`Costliest loss: a **${f.biggestLoss.ship}** ({-${f.biggestLoss.value} ISK}) in ${f.biggestLoss.system}.`);
  }

  return {
    headline,
    paragraphs: [p1, sentences.join(" "), theatre.join(" ")].filter((p) => p.trim().length > 0),
    readiness,
  };
}
