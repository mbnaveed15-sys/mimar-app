/**
 * A tool's hint in a finger's words, for a tablet or a phone: tap for click, press and hold for
 * right-click, two fingers for the middle mouse button. Talk of the Space key goes (Select is a
 * button there).
 */
export function touchHint(hint: string): string {
  return hint
    .replace(' Space selects from any tool.', '')
    .replace('Middle-drag pans with any tool.', 'Two fingers pan and pinch to zoom with any tool.')
    .replace(/Right-click/g, 'Press and hold')
    .replace(/right-click/g, 'press and hold')
    .replace(/\bClick/g, 'Tap')
    .replace(/\bclick/g, 'tap');
}
