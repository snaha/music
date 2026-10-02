export const desktop = $state<{ status: DesktopStatus | null; error: string }>({ status: null, error: '' });

export function initDesktop() {
  const api = window.desktop;
  if (!api) return () => {};
  const dispose = api.onChange(status => { desktop.status = status; });
  api.status().then(status => { desktop.status = status; }).catch(error => { desktop.error = error.message; });
  return dispose;
}
