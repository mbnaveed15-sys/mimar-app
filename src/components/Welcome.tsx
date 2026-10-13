import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { listRecent } from '../lib/recent';
import { buildSamplePlan } from '../lib/samplePlan';
import { markSeen } from '../lib/welcome';
import { plannerStore } from '../store/plannerStore';
import { Mark } from './Mark';
import { useFocusTrap } from './useFocus';
import { useCoarsePointer } from './useCompact';

interface Step {
  /** What to point at (a CSS selector); the step is centred when it isn't on screen. */
  target: string;
  title: string;
  body: string;
}

const DESK_STEPS: Step[] = [
  {
    target: 'nav[aria-label="Tools"]',
    title: 'Your tools',
    body: 'Walls (W), rooms (A), doors (D), windows (Shift+W), furniture (K), columns, slabs, stairs and more. Hover a tool to see its key.',
  },
  {
    target: '[data-testid="plan-canvas"], [data-testid="plan-3d"]',
    title: 'Draw walls',
    body: "Pick Wall, click where it starts, then click each corner. Or type a length like 12' and press Enter. Esc stops. Walls snap to ends, midpoints and the grid.",
  },
  {
    target: 'aside[aria-label="Properties"]',
    title: 'Rooms, sizes and materials',
    body: 'Click inside walls with Room to see the area in sq ft and marla. Select anything to change its size here, and pick materials from the library.',
  },
  {
    target: 'button[aria-label^="Floor:"]',
    title: 'Floors and structure',
    body: 'Add floors above, and place columns, beams, slabs and stairs. Floors stack on the plinth in 3D.',
  },
  {
    target: '[role="radiogroup"][aria-label="View"]',
    title: 'Build in 3D',
    body: 'Switch to 3D at any time; every tool works there too. Middle-drag to turn the view, Shift+middle-drag to move it, scroll to zoom.',
  },
  {
    target: '[role="menubar"]',
    title: 'Save, print and share',
    body: 'File has Save, a PDF to scale, DXF for AutoCAD, 3D models for SketchUp and Twinmotion, and IFC for Revit and ArchiCAD. Help › Getting started brings this tour back.',
  },
];

/** The tour on a touch screen: the same parts, in finger words, and the gestures. */
const TOUCH_STEPS: Step[] = [
  {
    target: 'nav[aria-label="Tools"]',
    title: 'Your tools',
    body: 'Walls, rooms, doors, windows, furniture, columns, slabs, stairs and more. Select, Move, Eraser and Fit view stay at hand; tap a group to see its tools.',
  },
  {
    target: '[data-testid="plan-canvas"], [data-testid="plan-3d"]',
    title: 'Draw walls',
    body: 'Pick Wall, tap where it starts, then tap each corner. Walls snap to ends, midpoints and the grid. Press and hold for more choices.',
  },
  {
    target: '[data-testid="plan-canvas"], [data-testid="plan-3d"]',
    title: 'Gestures',
    body: 'Two fingers drag to move the view and pinch to zoom. Tap with two fingers to undo, with three to redo. In 3D, three fingers turn the view and a two-finger twist turns the model round your fingers.',
  },
  {
    target: 'aside[aria-label="Properties"]',
    title: 'Rooms, sizes and materials',
    body: 'Tap inside walls with Room to see the area in sq ft and marla. Select anything to change its size here, and pick materials from the library.',
  },
  {
    target: 'button[aria-label^="Floor:"]',
    title: 'Floors and structure',
    body: 'Add floors above, and place columns, beams, slabs and stairs. Floors stack on the plinth in 3D.',
  },
  {
    target: '[role="menubar"]',
    title: 'Save, print and share',
    body: 'File has Save, a PDF to scale, DXF for AutoCAD, 3D models for SketchUp and Twinmotion, and IFC for Revit and ArchiCAD. Help › Getting started brings this tour back.',
  },
];

/** Where the highlighted part of the screen is, kept up to date as the window changes. */
function useTargetRect(selector: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) return;
    const measure = () => {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.height > 0 ? r : null);
    };
    measure();
    window.addEventListener('resize', measure);
    const t = window.setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      window.clearInterval(t);
    };
  }, [selector]);
  return selector ? rect : null;
}

/**
 * First-run welcome: take the tour, start from a sample 5-marla house, or start blank. The tour
 * highlights each part of the screen in turn.
 */
export function Welcome({
  onClose,
  confirmReplace,
  onNewProject,
  onRecent,
}: {
  onClose: () => void;
  confirmReplace: (then: () => void) => void;
  /** Start a new project (a house, a free project or a building), after asking about unsaved changes. */
  onNewProject?: () => void;
  /** Show the plans opened or saved lately. */
  onRecent?: () => void;
}) {
  const [step, setStep] = useState<number | null>(null);
  const STEPS = useCoarsePointer() ? TOUCH_STEPS : DESK_STEPS;
  const hasPlan = plannerStore.getState().doc.elements.length > 0;
  const [hasRecent, setHasRecent] = useState(false);
  useEffect(() => {
    let live = true;
    void listRecent().then((l) => live && setHasRecent(l.length > 0));
    return () => {
      live = false;
    };
  }, []);
  const rect = useTargetRect(step === null ? null : STEPS[step].target);
  const ref = useRef<HTMLDivElement>(null);
  const isTop = useFocusTrap(ref, step === null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog opened over the welcome (unsaved changes) takes the keys.
      if (!isTop()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish();
      }
      // In the tour, the arrow keys go back and forward.
      if (step !== null && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.stopPropagation();
        e.preventDefault();
        if (e.key === 'ArrowLeft') setStep(Math.max(0, step - 1));
        else if (step < STEPS.length - 1) setStep(step + 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  function finish() {
    markSeen();
    onClose();
  }

  function openSample() {
    confirmReplace(() => {
      plannerStore.getState().loadDocument(buildSamplePlan(), { name: '5 marla sample.mimar' });
      setStep(0);
    });
  }

  if (step === null)
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to MIMAR"
          className="w-full max-w-md rounded-xl border border-line bg-raised p-6 text-ink shadow-popover"
        >
          <div className="flex items-center gap-3">
            <Mark size={52} />
            <div>
              <h2 className="text-xl font-semibold">Welcome to MIMAR</h2>
              <p className="text-sm text-muted">Houses, buildings and studio projects, in 2D and 3D.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button autoFocus className="m-btn m-btn-primary justify-center py-2" onClick={() => setStep(0)}>
              Take the tour (1 minute)
            </button>
            <button className="m-btn justify-center py-2" onClick={openSample}>
              Start with a sample 5-marla house
            </button>
            {onNewProject && (
              <button
                className="m-btn justify-center py-2"
                onClick={() => {
                  markSeen();
                  onNewProject();
                }}
              >
                Start a new project…
              </button>
            )}
            {onRecent && hasRecent && (
              <button
                className="m-btn justify-center py-2"
                onClick={() => {
                  markSeen();
                  onRecent();
                }}
              >
                Open a recent plan…
              </button>
            )}
            <button className="m-btn justify-center py-2" onClick={finish}>
              {hasPlan ? 'Carry on with my plan' : 'Start blank'}
            </button>
          </div>
          <p className="mt-4 text-xs text-muted">You can see this again from Help › Getting started.</p>
        </div>
      </div>
    );

  const s = STEPS[step];
  const pad = 6;
  // The card sits beside the highlighted part where there is room, else below or above it (a phone),
  // otherwise in the middle.
  const card = Math.min(320, window.innerWidth - 24);
  let left = window.innerWidth / 2 - card / 2;
  let top: number | undefined = window.innerHeight / 2 - 90;
  let bottom: number | undefined;
  if (rect) {
    const roomRight = window.innerWidth - rect.right > card + 24;
    const roomLeft = rect.left > card + 24;
    const roomBelow = window.innerHeight - rect.bottom > 260;
    const roomAbove = rect.top > 260;
    const under = () => Math.min(Math.max(12, rect.left), window.innerWidth - card - 12);
    if (roomRight) {
      left = rect.right + 16;
      top = Math.min(Math.max(12, rect.top), window.innerHeight - 220);
    } else if (roomLeft) {
      left = rect.left - card - 16;
      top = Math.min(Math.max(12, rect.top), window.innerHeight - 220);
    } else if (roomBelow) {
      left = under();
      top = rect.bottom + 12;
    } else if (roomAbove) {
      left = under();
      top = undefined;
      bottom = window.innerHeight - rect.top + 12;
    }
  }
  return (
    <div className="fixed inset-0 z-50" data-testid="tour">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-accent transition-all"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.45)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/45" />
      )}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={s.title}
        className="absolute overflow-y-auto rounded-lg border border-line bg-raised p-4 text-ink shadow-popover"
        style={{ left, top, bottom, width: card, maxHeight: window.innerHeight - 24 - (top ?? bottom ?? 0) }}
      >
        <div className="text-xs text-muted">
          Step {step + 1} of {STEPS.length}
        </div>
        <h3 className="mt-1 font-semibold">{s.title}</h3>
        <p className="mt-1 text-sm">{s.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button className="m-btn text-xs" onClick={finish}>
            Skip
          </button>
          <span className="flex-1" />
          {step > 0 && (
            <button className="m-btn text-xs" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button autoFocus className="m-btn m-btn-primary text-xs" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button autoFocus className="m-btn m-btn-primary text-xs" onClick={finish}>
              Start drawing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
