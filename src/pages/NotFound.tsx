import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SearchX } from "lucide-react";
import { IconTile } from "@/components/common/SoftUI";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card p-8 text-center shadow-sm">
        <IconTile icon={SearchX} tone="brand" className="mb-4" />
        <h1 className="mb-2 text-4xl font-bold">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">Oops! Page not found</p>
        <a
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md hover:brightness-[1.06]"
        >
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
