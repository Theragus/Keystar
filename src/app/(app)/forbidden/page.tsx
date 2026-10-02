import { ShieldX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass } from "@/components/ui/glass";

export const metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <Glass className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={ShieldX}
        title="You don't have access to this page"
        action={<ButtonLink href="/">Back to dashboard</ButtonLink>}
      >
        Your Keystar role doesn&apos;t include the permission this page needs. Ask a director or admin if you think this is a
        mistake.
      </EmptyState>
    </Glass>
  );
}
