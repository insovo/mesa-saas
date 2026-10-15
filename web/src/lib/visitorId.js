const KEY = "mesa.visitor.v1";

export function visitorId() {
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  document.cookie = `mesa_visitor=${id}; Path=/api/public; SameSite=Lax; Secure`;
  return id;
}
