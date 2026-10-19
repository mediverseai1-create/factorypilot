"use client";
export function PrintButton() {
  return <button type="button" className="btn-ghost btn-sm print:hidden" onClick={() => window.print()}>Print / save PDF</button>;
}
