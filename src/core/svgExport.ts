import { f2 } from './geometry';

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Margin (mm) around the outermost radius; leaves room for the title block and dimensions. */
export const DRAWING_MARGIN_MM = 54;

/** Square export frame centred on the part, independent of the on-screen pan/zoom. */
export function exportFrame(maxR: number): Frame {
  const E = maxR + DRAWING_MARGIN_MM;
  return { x: -E, y: -E, w: 2 * E, h: 2 * E };
}

/** Sets viewBox in user units (mm) and physical width/height in mm, so 1 unit = 1 mm. */
export function applyExportFrame(svg: SVGSVGElement, f: Frame): void {
  svg.setAttribute('viewBox', `${f2(f.x)} ${f2(f.y)} ${f2(f.w)} ${f2(f.h)}`);
  svg.setAttribute('width', `${f2(f.w)}mm`);
  svg.setAttribute('height', `${f2(f.h)}mm`);
}
