import { useEffect, useLayoutEffect, useState } from 'react';
import { buildSamplePlan } from '../lib/samplePlan';
import { markSeen } from '../lib/welcome';
import { plannerStore } from '../store/plannerStore';
import { Mark } from './Mark';

interface Step {
  /** What to point at (a CSS selector); the step is centred when it isn't on screen. */
  target: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    target: 'nav[aria-label="Tools"]',
    title: 'Your tools',
    body: 'Walls (L), rooms (A), doors (D), windows (W), furniture (K), columns, slabs, stairs and more. Hover a tool to see its key.',
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
    body: 'File has Save, a PDF to scale, DXF for AutoCAD, and 3D models for SketchUp and Twinmotion. Help › Getting started brings this tour back.',
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
}: {
  onClose: () => void;
  confirmReplace: (then: () => void) => void;
}) {
  const [step, setStep] = useState<number | null>(null);
  const hasPlan = plannerStore.getState().doc.elements.length > 0;
  const rect = useTargetRect(step === null ? null : STEPS[step].target);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish();
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
          role="dialog"
          aria-label="Welcome to Mimar"
          className="w-full max-w-md rounded-xl border border-line bg-raised p-6 text-ink shadow-popover"
        >
          <div className="flex items-center gap-3">
            <Mark size={52} />
            <div>
              <h2 className="text-xl font-semibold">Welcome to Mimar</h2>
              <p className="text-sm text-muted">House plans in feet and marla, in 2D and 3D.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button autoFocus className="m-btn m-btn-primary justify-center py-2" onClick={() => setStep(0)}>
              Take the tour (1 minute)
            </button>
            <button className="m-btn justify-center py-2" onClick={openSample}>
              Start with a sample 5-marla house
            </button>
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
  // The card sits beside the highlighted part where there is room, otherwise in the middle.
  const card = 320;
  let left = window.innerWidth / 2 - card / 2;
  let top = window.innerHeight / 2 - 90;
  if (rect) {
    const roomRight = window.innerWidth - rect.right > card + 24;
    const roomLeft = rect.left > card + 24;
    const roomBelow = window.innerHeight - rect.bottom > 200;
    if (roomRight) {
      left = rect.right + 16;
      top = Math.min(Math.max(12, rect.top), window.innerHeight - 220);
    } else if (roomLeft) {
      left = rect.left - card - 16;
      top = Math.min(Math.max(12, rect.top), window.innerHeight - 220);
    } else if (roomBelow) {
      left = Math.min(Math.max(12, rect.left), window.innerWidth - card - 12);
      top = rect.bottom + 12;
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
        role="dialog"
        aria-label={s.title}
        className="absolute rounded-lg border border-line bg-raised p-4 text-ink shadow-popover"
        style={{ left, top, width: card }}
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
