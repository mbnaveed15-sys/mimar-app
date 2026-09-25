import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildCommands } from '../commands';
import { baseName } from '../lib/files';
import { usePlanner } from '../store/plannerStore';
import { Canvas } from './Canvas';
import { CommandPalette, ContextMenu, DiscardDialog, ShortcutsDialog, type ContextMenuState } from './Dialogs';
import { Icon } from './Icon';
import { MenuBar } from './MenuBar';
import { SidePanel } from './SidePanel';
import { StatusBar } from './StatusBar';
import { ToolDock, ToolDockOverlay } from './ToolDocks';
import { isDirty, useFileActions } from './useFileActions';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useOpenSections, type SectionId } from './useOpenSections';
import { ViewControls } from './ViewControls';
import { shouldWelcome } from '../lib/welcome';
import { Welcome } from './Welcome';

// three.js is large, so the 3D view loads the first time it is opened.
const Plan3DView = lazy(() => import('../three/Plan3DView'));

type Dialog = 'search' | 'shortcuts' | 'welcome' | null;

/** The editor: menu bar, tool rail, plan, side panel and status bar, like a classic desktop CAD app. */
export default function PlannerApp() {
  const svgRef = useRef<SVGSVGElement>(null);
  const view3d = usePlanner((s) => s.view3d);
  const warnings = usePlanner((s) => s.warnings);
  const setWarning = usePlanner((s) => s.setWarning);
  const fileName = usePlanner((s) => s.fileName);
  const dirty = usePlanner((s) => s.doc !== s.savedDoc);
  const { save, open, newPlan } = useFileActions();
  const [pending, setPending] = useState<'new' | 'open' | null>(null);
  const [dialog, setDialog] = useState<Dialog>(() => (shouldWelcome() ? 'welcome' : null));
  /** Replacing the plan from the welcome (the sample house) waits for this when there are unsaved changes. */
  const [pendingReplace, setPendingReplace] = useState<(() => void) | null>(null);
  const [menuAt, setMenuAt] = useState<ContextMenuState | null>(null);
  const sections = useOpenSections();
  const { set: setSection } = sections;

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${baseName(fileName)} — Mimar`;
  }, [fileName, dirty]);

  // Replacing the plan asks first when there are unsaved changes.
  const requestNew = useCallback(() => (isDirty() ? setPending('new') : newPlan()), [newPlan]);
  const requestOpen = useCallback(() => (isDirty() ? setPending('open') : void open()), [open]);
  const showSection = useCallback(
    (id: string) => {
      setSection(id as SectionId, true);
      requestAnimationFrame(() => document.getElementById(`section-${id}`)?.scrollIntoView({ block: 'nearest' }));
    },
    [setSection],
  );
  const updates = typeof window !== 'undefined' ? window.mimarUpdates : undefined;

  const commands = useMemo(
    () =>
      buildCommands({
        requestNew,
        requestOpen,
        save: (saveAs) => void save(saveAs),
        openSearch: () => setDialog('search'),
        openShortcuts: () => setDialog('shortcuts'),
        openWelcome: () => setDialog('welcome'),
        showSection,
        checkForUpdates: updates ? () => void updates.check() : undefined,
      }),
    [requestNew, requestOpen, save, showSection, updates],
  );
  useKeyboardShortcuts(commands);

  function focusProperties() {
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>('aside[aria-label="Properties"] input');
      field?.focus();
    });
  }

  return (
    <div className="flex h-screen flex-col bg-surface text-ink">
      <MenuBar commands={commands} onSearch={() => setDialog('search')} />
      <ToolDock area="top" />
      <div className="flex min-h-0 flex-1">
        <ToolDock area="left" />
        <main className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
          {view3d ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-muted">Loading 3D…</div>}>
              <Plan3DView onContextMenu={setMenuAt} />
            </Suspense>
          ) : (
            <>
              <Canvas svgRef={svgRef} onContextMenu={setMenuAt} />
              <ViewControls />
            </>
          )}
          {warnings.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2">
              {warnings.map((w) => (
                <div
                  key={w}
                  role="alert"
                  className="pointer-events-auto flex max-w-lg items-start gap-2 rounded-md border border-accent bg-raised px-3 py-2 text-xs shadow-popover"
                >
                  <span className="flex-1">{w}</span>
                  <button aria-label="Dismiss" onClick={() => setWarning(null)} className="text-muted hover:text-ink">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
        <ToolDock area="right" />
        <SidePanel sections={sections} />
      </div>
      <ToolDock area="bottom" />
      <StatusBar />
      <ToolDockOverlay />

      {menuAt && <ContextMenu at={menuAt} onClose={() => setMenuAt(null)} onProperties={focusProperties} />}
      {dialog === 'search' && <CommandPalette commands={commands} onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog commands={commands} onClose={() => setDialog(null)} />}
      {dialog === 'welcome' && (
        <Welcome
          onClose={() => setDialog(null)}
          confirmReplace={(then) => (isDirty() ? setPendingReplace(() => then) : then())}
        />
      )}
      {pendingReplace && (
        <DiscardDialog
          action="open"
          onCancel={() => setPendingReplace(null)}
          onConfirm={() => {
            pendingReplace();
            setPendingReplace(null);
          }}
        />
      )}
      {pending && (
        <DiscardDialog
          action={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            if (pending === 'new') newPlan();
            else void open();
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
