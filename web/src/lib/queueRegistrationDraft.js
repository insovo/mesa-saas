export const EMPTY_QUEUE_REGISTRATION = { name: "", school: "", major: "", degree: "本科", gradYear: 2027, languageAbility: "", phone: "", jobDirection: "", email: "" };
const keyFor = (token) => `mesa.queue.registration.draft.v1.${token}`;

export function readQueueRegistrationDraft(token, storage) {
  const form = { ...EMPTY_QUEUE_REGISTRATION };
  try {
    const draft = JSON.parse((storage ?? globalThis.sessionStorage).getItem(keyFor(token)) || "null");
    for (const key of Object.keys(form)) {
      if (typeof draft?.[key] === "string" || (key === "gradYear" && typeof draft?.[key] === "number")) form[key] = draft[key];
    }
  } catch { /* 草稿不可用时继续正常登记 */ }
  return form;
}
export function saveQueueRegistrationDraft(token, form, storage) {
  try { (storage ?? globalThis.sessionStorage).setItem(keyFor(token), JSON.stringify(Object.fromEntries(Object.keys(EMPTY_QUEUE_REGISTRATION).map((key) => [key, form[key]])))); } catch { /* 存储受限时保留当前页面的填写状态 */ }
}
export function clearQueueRegistrationDraft(token, storage) {
  try { (storage ?? globalThis.sessionStorage).removeItem(keyFor(token)); } catch { /* 不影响已完成的登记 */ }
}
