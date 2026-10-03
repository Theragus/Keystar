import { Crosshair, ExternalLink, Gamepad2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { TypeIcon } from "@/components/ui/eve-image";
import type { Messages } from "@/i18n/messages";
import { isPaleOnLight, plainText, type EveNode } from "../eve-html";
import { classifyLink, killReportUrl, resolveShowinfo, webUrlFor } from "../links";
import type { LinkContext } from "../queries";
import { CopyChip } from "./copy-chip";
import { EntityAvatar } from "./entity-avatar";

type T = Messages["social"];

const linkClass = "text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent";
const chipClass = "glass-chip inline-flex items-center gap-1 rounded-md px-1.5 py-px align-baseline text-[0.92em] text-ink";
const external = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;

/**
 * Renders a parsed mail body as React elements: text is always a text node,
 * styles come only from validated values, and links are rebuilt from their
 * classification (EVE client links become web links or labelled chips).
 */
export function MailBody({ nodes, links, t }: { nodes: EveNode[]; links: LinkContext; t: T }) {
  return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{render(nodes, links, t)}</div>;
}

function render(nodes: EveNode[], links: LinkContext, t: T): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.t) {
      case "text":
        return node.text;
      case "br":
        return <br key={i} />;
      case "tab":
        return <span key={i} className="inline-block w-8" />;
      case "bold":
        return (
          <strong key={i} className="font-semibold">
            {render(node.children, links, t)}
          </strong>
        );
      case "italic":
        return <em key={i}>{render(node.children, links, t)}</em>;
      case "underline":
        return <u key={i}>{render(node.children, links, t)}</u>;
      case "uppercase":
        return (
          <span key={i} className="uppercase">
            {render(node.children, links, t)}
          </span>
        );
      case "style": {
        const style: CSSProperties & { "--mail-color"?: string } = {};
        if (node.color) style["--mail-color"] = node.color;
        if (node.size) style.fontSize = `${node.size}em`;
        if (node.letterSpacing) style.letterSpacing = `${node.letterSpacing}px`;
        return (
          <span
            key={i}
            style={style}
            className={node.color ? "mail-color" : undefined}
            data-pale={node.color && isPaleOnLight(node.color) ? "" : undefined}
          >
            {render(node.children, links, t)}
          </span>
        );
      }
      case "hint":
        return (
          <span key={i} title={node.title} className="cursor-help underline decoration-ink-3 decoration-dotted underline-offset-2">
            {render(node.children, links, t)}
          </span>
        );
      case "link":
        return <MailLink key={i} node={node} links={links} t={t} />;
    }
  });
}

function MailLink({ node, links, t }: { node: Extract<EveNode, { t: "link" }>; links: LinkContext; t: T }) {
  const link = classifyLink(node.href);
  const children = render(node.children, links, t);
  const text = plainText(node.children).trim();

  switch (link.kind) {
    case "showinfo": {
      const type = links.types.get(link.typeId);
      const entity = link.itemId !== null ? links.entities.get(link.itemId) : undefined;
      const kind = resolveShowinfo(link, { groupId: type?.groupId, categoryId: type?.categoryId, entityCategory: entity?.category });
      const id = link.itemId ?? link.typeId;
      const name =
        kind === "type" || kind === "item" ? (type?.name ?? t.fallback.type(link.typeId)) : (entity?.name ?? t.fallback.entity(id));
      // The link text is the author's; the tooltip says what the link really points at.
      const title = t.links.titled(t.links.kinds[kind] ?? kind, name);
      const icon =
        kind === "character" || kind === "corporation" || kind === "alliance" ? (
          <EntityAvatar id={id} category={kind} size={16} className="mr-1 inline-block align-[-3px]" />
        ) : kind === "type" || kind === "item" ? (
          <TypeIcon id={link.typeId} size={16} className="mr-1 inline-block align-[-3px]" />
        ) : null;
      const url = webUrlFor(kind, link.typeId, link.itemId);
      const content = (
        <>
          {icon}
          {text ? children : name}
        </>
      );
      return url ? (
        <a href={url} title={title} className={linkClass} {...external}>
          {content}
        </a>
      ) : (
        <span title={`${title} · ${t.links.clientOnly}`} className="underline decoration-ink-3 decoration-dotted underline-offset-2">
          {content}
        </span>
      );
    }
    case "killReport":
      return (
        <a href={killReportUrl(link.killmailId)} title={t.links.killReport} className={linkClass} {...external}>
          <Crosshair className="mr-1 inline-block size-3.5 align-[-2px]" aria-hidden />
          {text ? children : t.links.killReport}
        </a>
      );
    case "fitting": {
      const ship = links.types.get(link.shipTypeId)?.name ?? t.fallback.type(link.shipTypeId);
      return (
        <span className={chipClass} title={t.links.titled(t.links.fitting, ship)}>
          <TypeIcon id={link.shipTypeId} size={16} />
          <span>{text ? children : ship}</span>
          <CopyChip value={link.dna} label={t.links.fittingCopy} />
        </span>
      );
    }
    case "web": {
      const host = new URL(link.url).host;
      return (
        <a href={link.url} title={t.links.external(host)} className={linkClass} {...external}>
          {text ? children : link.url}
          <ExternalLink className="ml-0.5 inline-block size-3 align-[-1px]" aria-hidden />
        </a>
      );
    }
    case "client":
      return (
        <span className={chipClass} title={`${t.links.clientSchemes[link.scheme] ?? link.scheme} · ${t.links.clientOnly}`}>
          <Gamepad2 className="size-3.5 text-ink-3" aria-hidden />
          <span>{text ? children : (t.links.clientSchemes[link.scheme] ?? link.scheme)}</span>
        </span>
      );
    default:
      // Unknown or unsafe schemes (javascript:, data: …) are never links.
      return <>{children}</>;
  }
}
