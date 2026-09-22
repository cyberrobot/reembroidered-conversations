"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Printer,
  Search,
  X,
} from "lucide-react";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LEGAL_DOCUMENTS,
  PUBLIC_COMPANY,
  PUBLIC_REGISTERED_OFFICE,
  type LegalDocumentId,
  type LegalSection,
} from "../data/legal";
import { currentLegalNavigationState, LegalLink } from "./LegalLink";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isActuallyFocusable(element: HTMLElement) {
  if (
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.closest("[inert], [aria-hidden='true'], details:not([open])")
  ) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.visibility !== "collapse" &&
    element.getClientRects().length > 0
  );
}

function visibleFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(isActuallyFocusable);
}

function legalState() {
  const params = new URL(window.location.href).searchParams;
  const legal = params.get("legal");
  return {
    document: legal === "terms" || legal === "privacy" ? legal : null,
    section: params.get("legalSection"),
  } as const;
}

function countMatches(text: string, query: string) {
  if (!query) return 0;
  let count = 0;
  let position = 0;
  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  while ((position = lowerText.indexOf(lowerQuery, position)) !== -1) {
    count += 1;
    position += lowerQuery.length;
  }
  return count;
}

export function LegalModal() {
  const [state, setState] = useState<ReturnType<typeof legalState>>({
    document: null,
    section: null,
  });
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);

  const syncFromUrl = useCallback(() => {
    setState(legalState());
  }, []);

  useEffect(() => {
    syncFromUrl();
    const handleNavigation = (event: Event) => {
      const opener = (event as CustomEvent<{ opener?: HTMLElement }>).detail
        ?.opener;
      if (opener && !dialogRef.current?.contains(opener)) {
        openerRef.current = opener;
      }
      syncFromUrl();
    };
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener("legal-navigation", handleNavigation);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener("legal-navigation", handleNavigation);
    };
  }, [syncFromUrl]);

  const legalDocument = state.document ? LEGAL_DOCUMENTS[state.document] : null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchableText = useMemo(() => {
    if (!legalDocument) return [];
    return [
      legalDocument.title,
      ...legalDocument.introduction,
      ...legalDocument.sections.flatMap((section) => [
        section.title,
        ...section.paragraphs,
      ]),
    ];
  }, [legalDocument]);
  const matchCount = useMemo(
    () =>
      normalizedQuery
        ? searchableText.reduce(
            (total, text) => total + countMatches(text, normalizedQuery),
            0,
          )
        : 0,
    [normalizedQuery, searchableText],
  );

  useEffect(() => {
    setQuery("");
    setActiveMatch(0);
  }, [state.document]);

  useEffect(() => {
    if (legalDocument || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, [legalDocument]);

  useEffect(() => {
    setActiveMatch(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!legalDocument) return;
    const background = document.getElementById("site-content");
    const previousOverflow = document.body.style.overflow;
    if (background) background.inert = true;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      const target = state.section
        ? document.getElementById(
            `legal-${state.document}-section-${state.section}`,
          )
        : null;
      if (target) target.scrollIntoView({ block: "start" });
      else scrollRef.current?.scrollTo({ top: 0 });
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-legal-initial-focus]")
        ?.focus();
    });
    return () => {
      if (background) background.inert = false;
      document.body.style.overflow = previousOverflow;
    };
  }, [legalDocument, state.document, state.section]);

  useEffect(() => {
    if (!document || !normalizedQuery || matchCount === 0) return;
    dialogRef.current
      ?.querySelector<HTMLElement>(`[data-legal-match="${activeMatch}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMatch, legalDocument, matchCount, normalizedQuery]);

  const close = useCallback(() => {
    restoreFocusRef.current = true;
    const navigation = currentLegalNavigationState();
    if (
      navigation?.hasOriginEntry &&
      navigation.index > 0 &&
      navigation.stackId
    ) {
      window.history.go(-navigation.index);
      return;
    }
    const url = navigation?.originUrl
      ? new URL(navigation.originUrl)
      : new URL(window.location.href);
    url.searchParams.delete("legal");
    url.searchParams.delete("legalSection");
    const nextState = { ...window.history.state };
    delete nextState.legalNavigation;
    window.history.replaceState(nextState, "", url);
    setState({ document: null, section: null });
  }, []);

  useEffect(() => {
    if (!legalDocument) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = visibleFocusableElements(dialogRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, legalDocument]);

  if (!legalDocument || !state.document) return null;

  let renderedMatch = 0;
  const highlight = (text: string): ReactNode => {
    if (!normalizedQuery) return text;
    const parts: ReactNode[] = [];
    const lowerText = text.toLocaleLowerCase();
    let position = 0;
    let found = lowerText.indexOf(normalizedQuery, position);
    while (found !== -1) {
      if (found > position) parts.push(text.slice(position, found));
      const index = renderedMatch++;
      parts.push(
        <mark
          key={`${found}-${index}`}
          data-legal-match={index}
          className={
            index === activeMatch
              ? "rounded-sm bg-[#A35048] px-0.5 text-white outline-2 outline-offset-1 outline-[#A35048]"
              : "rounded-sm bg-[#F3D7A5] px-0.5 text-[#282524]"
          }
        >
          {text.slice(found, found + normalizedQuery.length)}
        </mark>,
      );
      position = found + normalizedQuery.length;
      found = lowerText.indexOf(normalizedQuery, position);
    }
    parts.push(text.slice(position));
    return parts;
  };

  const sectionLink = (section: LegalSection) => (
    <LegalLink
      key={section.id}
      document={state.document!}
      section={section.id}
      className="block rounded-lg px-3 py-2 text-sm text-[#68635F] hover:bg-white hover:text-[#282524] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A35048]"
    >
      {section.title}
    </LegalLink>
  );

  return (
    <div
      className="legal-modal-backdrop fixed inset-0 z-[100] flex bg-[#282524]/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        className="legal-modal-panel flex h-full w-full flex-col overflow-hidden bg-[#FAF8F5] text-[#282524] shadow-2xl sm:h-[min(90vh,900px)] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-[#E8DFD5]"
      >
        <header className="legal-modal-controls shrink-0 border-b border-[#E8DFD5] bg-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[#A35048]">
                Version {legalDocument.version} · Effective{" "}
                {legalDocument.effectiveDate}
              </p>
              <h1
                id="legal-dialog-title"
                className="font-serif text-2xl font-medium sm:text-3xl"
              >
                {legalDocument.title}
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#68635F] hover:bg-[#F5EFE9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A35048]"
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Print</span>
              </button>
              <button
                type="button"
                data-legal-initial-focus
                onClick={close}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#68635F] hover:bg-[#F5EFE9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A35048]"
                aria-label="Close legal document"
              >
                <X className="h-5 w-5" />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <nav aria-label="Legal documents" className="flex gap-2 text-sm">
              {(["terms", "privacy"] as const).map((id) => (
                <LegalLink
                  key={id}
                  document={id}
                  aria-current={state.document === id ? "page" : undefined}
                  className={`rounded-full border px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A35048] ${
                    state.document === id
                      ? "border-[#A35048] bg-[#A35048] text-white"
                      : "border-[#E8DFD5] bg-[#FAF8F5] text-[#4B4643]"
                  }`}
                >
                  {id === "terms" ? "Terms" : "Privacy Notice"}
                </LegalLink>
              ))}
            </nav>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1 text-xs text-[#4B4643] sm:min-w-64">
                Search this document
                <span className="mt-1 flex items-center rounded-lg border border-[#D9CFC4] bg-white px-3 focus-within:border-[#A35048]">
                  <Search className="h-4 w-4 shrink-0 text-[#78716C]" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm outline-none"
                    placeholder="Search headings and text"
                  />
                </span>
              </label>
              {normalizedQuery && (
                <div
                  className="flex items-center gap-1"
                  aria-label="Search results"
                >
                  <button
                    type="button"
                    disabled={matchCount === 0}
                    onClick={() =>
                      setActiveMatch(
                        (current) => (current - 1 + matchCount) % matchCount,
                      )
                    }
                    className="rounded-lg border border-[#E8DFD5] bg-white p-2.5 disabled:opacity-40"
                    aria-label="Previous match"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={matchCount === 0}
                    onClick={() =>
                      setActiveMatch((current) => (current + 1) % matchCount)
                    }
                    className="rounded-lg border border-[#E8DFD5] bg-white p-2.5 disabled:opacity-40"
                    aria-label="Next match"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="rounded-lg px-2 py-2.5 text-xs text-[#A35048] underline underline-offset-4"
                  >
                    Clear
                  </button>
                </div>
              )}
              <p className="sr-only" aria-live="polite" aria-atomic="true">
                {normalizedQuery
                  ? `${matchCount} ${matchCount === 1 ? "match" : "matches"} found`
                  : "Search cleared"}
              </p>
            </div>
          </div>
          {normalizedQuery && (
            <p className="mt-2 text-right text-xs text-[#68635F]" aria-hidden>
              {matchCount === 0
                ? "No matches"
                : `${activeMatch + 1} of ${matchCount} matches`}
            </p>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-[#E8DFD5] bg-[#F5EFE9]/60 p-4 lg:block">
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[#78716C]">
              In this document
            </p>
            <nav aria-label={`${legalDocument.title} sections`}>
              {legalDocument.sections.map(sectionLink)}
            </nav>
          </aside>
          <div
            ref={scrollRef}
            className="legal-document min-w-0 flex-1 overflow-y-auto"
          >
            <article className="mx-auto max-w-3xl px-5 py-8 sm:px-10 sm:py-10">
              <div className="legal-print-heading mb-8 border-b border-[#E8DFD5] pb-7">
                <h2 className="font-serif text-3xl font-medium">
                  {highlight(legalDocument.title)}
                </h2>
                <p className="mt-2 text-sm text-[#68635F]">
                  Version {legalDocument.version} · Effective{" "}
                  {legalDocument.effectiveDate}
                </p>
                <div className="mt-5 space-y-3 text-sm leading-7 text-[#4B4643]">
                  {legalDocument.introduction.map((paragraph, index) => (
                    <p key={index}>{highlight(paragraph)}</p>
                  ))}
                </div>
              </div>

              <details className="mb-8 rounded-xl border border-[#E8DFD5] bg-white p-4 lg:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                  Sections <ChevronDown className="h-4 w-4" />
                </summary>
                <nav
                  className="mt-3"
                  aria-label={`${legalDocument.title} sections`}
                >
                  {legalDocument.sections.map(sectionLink)}
                </nav>
              </details>

              <div className="space-y-10">
                {legalDocument.sections.map((section, index) => (
                  <section
                    key={section.id}
                    id={`legal-${state.document}-section-${section.id}`}
                    className="scroll-mt-6"
                  >
                    <h2 className="font-serif text-2xl font-medium text-[#282524]">
                      <span className="mr-2 text-base text-[#A35048]">
                        {index + 1}.
                      </span>
                      {highlight(section.title)}
                    </h2>
                    <div className="mt-3 space-y-3 text-sm leading-7 text-[#4B4643] sm:text-[15px]">
                      {section.paragraphs.map((paragraph, paragraphIndex) => (
                        <p key={paragraphIndex}>{highlight(paragraph)}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <footer className="mt-12 border-t border-[#E8DFD5] pt-6 text-xs leading-6 text-[#68635F]">
                <p className="font-medium text-[#282524]">
                  {PUBLIC_COMPANY.legalName}
                </p>
                <p>
                  Company number {PUBLIC_COMPANY.companyNumber} · Registered in{" "}
                  {PUBLIC_COMPANY.jurisdiction}
                </p>
                <p>Registered office: {PUBLIC_REGISTERED_OFFICE}</p>
              </footer>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
