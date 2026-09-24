import { usePlanner } from '../store/plannerStore';

/** Components in this plan: how many copies each has, and a button to place another. */
export function ComponentsPanel() {
  const components = usePlanner((s) => s.doc.components);
  const groups = usePlanner((s) => s.doc.groups);
  const place = usePlanner((s) => s.placeComponentCopy);

  if (!components.length)
    return (
      <p className="text-xs text-muted">
        Select walls, doors or furniture and press G (or Edit › Make component) to make a reusable part. Copies stay
        linked: edit one and the rest follow.
      </p>
    );
  return (
    <ul className="flex flex-col gap-1 text-xs" aria-label="Components">
      {components.map((c) => {
        const copies = groups.filter((g) => g.componentId === c.id).length;
        return (
          <li
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md border border-line bg-raised px-2 py-1"
          >
            <span className="min-w-0 truncate">
              {c.name}{' '}
              <span className="text-muted">
                · {copies} {copies === 1 ? 'copy' : 'copies'}
              </span>
            </span>
            <button
              className="m-btn px-2 py-0.5"
              onClick={() => place(c.id)}
              title="Place a copy in the middle of the view"
            >
              Place
            </button>
          </li>
        );
      })}
    </ul>
  );
}
