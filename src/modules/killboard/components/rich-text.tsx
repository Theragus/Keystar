import { parseMarkup, type Segment } from "../report/markup";

/**
 * Renders report markup (**bold**, {+good}, {-bad}, {@Pilot}) as styled text
 * nodes: model output can style words but never inject HTML.
 */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseMarkup(text).map((s: Segment, i) => {
        switch (s.kind) {
          case "bold":
            return (
              <strong key={i} className="font-semibold text-ink">
                {s.text}
              </strong>
            );
          case "good":
            return (
              <span key={i} className="font-medium text-good-text">
                {s.text}
              </span>
            );
          case "bad":
            return (
              <span key={i} className="font-medium text-critical-text">
                {s.text}
              </span>
            );
          case "pilot":
            return (
              <span key={i} className="font-medium text-accent">
                {s.text}
              </span>
            );
          default:
            return <span key={i}>{s.text}</span>;
        }
      })}
    </>
  );
}
