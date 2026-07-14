export function getSidebarFocusableElements(sidebar: HTMLElement): HTMLElement[] {
  return Array.from(
    sidebar.querySelectorAll<HTMLElement>('a[href]:not(.sidebar__focus-guard), button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not(.sidebar__focus-guard)'),
  );
}
