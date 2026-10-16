export function watchQueueChanges({ check, onError, visibility = document, schedule = setTimeout, cancel = clearTimeout, random = Math.random }) {
  let stopped = false;
  let running = false;
  let timer;
  let failures = 0;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const plan = () => {
    if (stopped || visibility.hidden) return;
    const delay = failures ? Math.min(30000, 5000 * 2 ** (failures - 1)) : 3000;
    timer = schedule(run, Math.round(delay * (0.8 + random() * 0.4)));
  };
  async function run() {
    if (stopped || running || visibility.hidden) return;
    clear(); running = true;
    try {
      await check();
      failures = 0;
    } catch (err) {
      if (stopped) return;
      failures++;
      if ([401, 403, 410].includes(err.response?.status)) stopped = true;
      onError(err);
    } finally {
      running = false;
      plan();
    }
  }
  const resume = () => { clear(); if (!visibility.hidden) void run(); };
  visibility.addEventListener("visibilitychange", resume);
  plan();
  return () => { stopped = true; clear(); visibility.removeEventListener("visibilitychange", resume); };
}
