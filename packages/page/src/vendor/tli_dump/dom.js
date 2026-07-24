const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const byId = id => document.getElementById(id);

export const escapeHtml = value => String(value).replace(
  /[&<>"']/g,
  character => HTML_ENTITIES[character],
);

export function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const valueHtml = (value, className = "") => {
  const empty = value === null || value === undefined || value === "";
  const classes = [className, empty ? "unknown" : ""].filter(Boolean).join(" ");
  return `<span${classes ? ` class="${classes}"` : ""}>${escapeHtml(displayValue(value))}</span>`;
};

export function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

export function hideError(element) {
  element.hidden = true;
  element.textContent = "";
}
