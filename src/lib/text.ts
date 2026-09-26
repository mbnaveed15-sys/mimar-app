/** Control characters (and non-characters) that break SVG, PDF and file export. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F￾￿]/g;

/** A name as the user typed it, without characters that can't be drawn or saved; line breaks become spaces. */
export const cleanText = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(CONTROL, '');
