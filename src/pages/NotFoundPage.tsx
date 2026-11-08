import { Link } from "react-router-dom";
import { Button, EmptyState } from "@/components/ui";
import { Ghost } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-(--color-bg) p-6">
      <EmptyState
        icon={<Ghost size={56} strokeWidth={1.5} />}
        title="Page not found"
        description="The page you're looking for doesn't exist or has been moved."
        action={
          <Link to="/">
            <Button variant="secondary">Back to Home</Button>
          </Link>
        }
      />
    </div>
  );
}

