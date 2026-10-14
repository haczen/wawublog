import type { ReactNode } from "react";
import { SiteSidebar } from "./site-sidebar";
import { ArticleTocProvider } from "../state/article-toc";

export function RouteShell({ header, content, footer }: { header: ReactNode; content: ReactNode; footer: ReactNode }) {
  return (
    <ArticleTocProvider>
      <div className="flex min-h-screen flex-col">
        {header}
        <div className="mx-4 flex-1 sm:mx-6 md:mx-8">
          <div className="flex w-full items-start gap-6">
            <SiteSidebar />
            <div className="min-w-0 w-full">
              {content}
              {footer}
            </div>
          </div>
        </div>
      </div>
    </ArticleTocProvider>
  );
}
