import { createContext, useContext, useState, type ReactNode } from "react";

type ArticleTocContextValue = {
  toc: ReactNode;
  setToc: (toc: ReactNode) => void;
};

const ArticleTocContext = createContext<ArticleTocContextValue>({
  toc: null,
  setToc: () => {},
});

export function ArticleTocProvider({ children }: { children: ReactNode }) {
  const [toc, setToc] = useState<ReactNode>(null);
  return <ArticleTocContext.Provider value={{ toc, setToc }}>{children}</ArticleTocContext.Provider>;
}

/** Read the article TOC registered by the reading page (null outside article routes). */
export function useArticleToc() {
  return useContext(ArticleTocContext).toc;
}

/** Register/unregister the current article's TOC into the left rail. */
export function useSetArticleToc() {
  return useContext(ArticleTocContext).setToc;
}
