import { ICONS, type IconName } from '../theme/icons';

/** One of the Mimar line icons. It takes the text colour of whatever it sits in. */
export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`block flex-none ${className ?? ''}`}
      // The icon paths are fixed strings from src/theme/icons.ts.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
