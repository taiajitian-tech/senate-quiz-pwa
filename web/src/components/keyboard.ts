// Let native controls keep their keyboard behavior, and never operate behind a modal.
export function ignoreShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return true;
  if (document.querySelector('[aria-modal="true"]')) return true;
  return event.target instanceof Element && !!event.target.closest(
    'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"]'
  );
}
