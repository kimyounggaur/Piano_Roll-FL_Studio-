import { useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════════════════════════════
//  useDetachableWindow (#54)
//  Manages a popup window for portal rendering. Caller is responsible
//  for using ReactDOM.createPortal(node, container) to mount React tree.
// ═══════════════════════════════════════════════════════════════════
export interface DetachState {
  /** Document body of the popup window. Use as createPortal target. */
  container: HTMLElement | null;
  detach: () => void;
  reattach: () => void;
}

export function useDetachableWindow(title = 'RollLab — Piano Roll'): DetachState {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const winRef = useRef<Window | null>(null);

  const detach = () => {
    if (winRef.current && !winRef.current.closed) return;
    const w = window.open('', '_blank', 'width=1200,height=720,resizable=yes,scrollbars=yes');
    if (!w) return;
    w.document.title = title;
    // Clone all stylesheets so the popup looks the same as the parent.
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const cssText = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
        const style = w.document.createElement('style');
        style.textContent = cssText;
        w.document.head.appendChild(style);
      } catch {
        // Cross-origin stylesheet — clone the <link> tag instead.
        const link = (sheet.ownerNode as HTMLLinkElement | null);
        if (link?.href) {
          const newLink = w.document.createElement('link');
          newLink.rel = 'stylesheet';
          newLink.href = link.href;
          w.document.head.appendChild(newLink);
        }
      }
    }
    // Mount root container.
    const root = w.document.createElement('div');
    root.id = 'detached-root';
    root.style.height = '100%';
    w.document.body.style.margin = '0';
    w.document.body.appendChild(root);
    winRef.current = w;
    setContainer(root);

    // Close child when parent closes.
    const onUnload = () => { try { w.close(); } catch { /* noop */ } };
    window.addEventListener('beforeunload', onUnload);
    // Detect child close → restore inline layout.
    const checkInterval = window.setInterval(() => {
      if (w.closed) {
        window.clearInterval(checkInterval);
        window.removeEventListener('beforeunload', onUnload);
        setContainer(null);
        winRef.current = null;
      }
    }, 500);
  };

  const reattach = () => {
    try { winRef.current?.close(); } catch { /* noop */ }
    winRef.current = null;
    setContainer(null);
  };

  useEffect(() => () => { try { winRef.current?.close(); } catch { /* noop */ } }, []);

  return { container, detach, reattach };
}
