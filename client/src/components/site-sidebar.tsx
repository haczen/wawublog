import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { client } from "../app/runtime";
import { useArticleToc } from "../state/article-toc";

interface TimelineItem {
  id: number;
  title: string | null;
  createdAt: string;
  listed?: number;
  draft?: number;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit" });

export function SiteSidebar() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const [feeds, setFeeds] = useState<TimelineItem[]>();
  const [keyword, setKeyword] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const loaded = useRef(false);
  const articleToc = useArticleToc();
  const currentId = location.match(/^\/feed\/(\d+)/)?.[1];
  // Article routes swap the article navigation for the reading page's TOC.
  const isArticleRoute = /^\/feed\/\d+/.test(location) || articleToc !== null;

  useEffect(() => {
    if (isArticleRoute) return;
    if (loaded.current) return;
    loaded.current = true;
    client.feed.timeline()
      .then(({ data }) => setFeeds(Array.isArray(data) ? data : []))
      .catch(() => setFeeds([]));
  }, [isArticleRoute]);

  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [currentId, feeds]);

  const onSearch = () => {
    const trimmed = keyword.trim();
    if (trimmed.length > 0) setLocation(`/search/${encodeURIComponent(trimmed)}`);
  };

  const groups = !feeds
    ? []
    : Object.entries(
        feeds.reduce<Record<string, TimelineItem[]>>((acc, item) => {
          const year = new Date(item.createdAt).getFullYear();
          (acc[year] ||= []).push(item);
          return acc;
        }, {}),
      ).sort((left, right) => Number(right[0]) - Number(left[0]));

  return (
    <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-72 shrink-0 flex-col self-start gap-4 pb-6 xl:flex">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
        className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-w px-4 py-3 shadow-xl shadow-light ring-1 ring-black/5 dark:ring-white/10"
      >
        <i className="ri-search-line shrink-0 text-base t-secondary" aria-hidden="true" />
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={t("article.search.placeholder")}
          aria-label={t("article.search.title")}
          className="w-full min-w-0 bg-transparent text-sm t-primary outline-none"
        />
      </form>
      {isArticleRoute ? (
        articleToc ? (
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">{articleToc}</div>
        ) : null
      ) : feeds && feeds.length > 0 ? (
        <nav
          ref={navRef}
          aria-label={t("article.title")}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl bg-w p-3 shadow-xl shadow-light ring-1 ring-black/5 dark:ring-white/10 scrollbar-none"
        >
          <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.2em] t-secondary">
            <span className="h-[3px] w-6 rounded-full bg-theme" aria-hidden="true" />
            {t("article.title")}
            <span className="ml-auto text-[11px] font-medium normal-case tracking-normal">
              {t("article.total_short$count", { count: feeds.length })}
            </span>
          </div>
          {groups.map(([year, items]) => (
            <div key={year} className="mb-1">
              <p className="flex items-baseline gap-2 px-3 pb-1 pt-3 text-[13px] font-bold t-primary">
                {year}
                <span className="text-[11px] font-medium t-secondary">
                  {t("article.total_short$count", { count: items.length })}
                </span>
              </p>
              {items.map(({ id, title, createdAt, listed, draft }) => {
                const active = String(id) === currentId;
                const selfOnly = listed === 0 || draft === 1;
                return (
                  <Link
                    key={id}
                    href={`/feed/${id}`}
                    data-active={active ? "true" : undefined}
                    title={title || t("visible.self_only")}
                    className={`group flex items-baseline gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-theme/10 font-medium text-theme"
                        : "t-primary hover:bg-black/5 dark:hover:bg-white/10"
                    }`}
                  >
                    <span className="shrink-0 text-xs tabular-nums t-secondary">{dateFormatter.format(new Date(createdAt))}</span>
                    {selfOnly ? (
                      <i className="ri-lock-line shrink-0 self-center text-xs t-secondary" title={t("visible.self_only")} aria-label={t("visible.self_only")} />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{title || t("visible.self_only")}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      ) : null}
    </aside>
  );
}
