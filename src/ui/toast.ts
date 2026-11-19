import { icon, type IconName } from '../engine/icons';

let host: HTMLElement | null = null;

export function toast(text: string, ico: IconName = 'sparkle', ms = 2200): void {
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(ico, 15)}<span></span>`;
  el.querySelector('span')!.textContent = text;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, ms);
}
