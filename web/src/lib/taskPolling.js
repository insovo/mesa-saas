export function taskPollDelay(unchanged = 0, failures = 0) {
  const base = failures > 0 ? Math.min(30000, 5000 * 2 ** Math.min(failures, 3)) : Math.min(15000, 5000 + unchanged * 1500);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}
