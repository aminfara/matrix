/**
 * @param {string} title
 * @param {string} body
 * @returns {string}
 */
export function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - MATRIX</title>
  <!-- SECURITY: INFO [supply-chain] PicoCss is loaded from jsDelivr CDN without a Subresource
       Integrity (SRI) hash. If the CDN is compromised, a malicious stylesheet could be served.
       Risk is low (CSS cannot execute JS in a modern browser without an unsafe CSP) and this is a
       local dev tool, but SRI is trivially easy to add.
      Fix needed: generate the SHA-384 hash of the current pico.min.css release and add
      integrity="sha384-<hash>" crossorigin="anonymous" to the <link> tag. Regenerate on each
       PicoCss version bump.
       Owner: Becky | First seen: 2026-05-01 | Tracking: n/a -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <style>
    /* Destructive action buttons — Pico has no built-in danger variant */
    button.destructive {
      --pico-background-color: var(--pico-color-red-450);
      --pico-border-color: var(--pico-color-red-450);
      --pico-color: #fff;
    }
    button.destructive:hover,
    button.destructive:focus {
      --pico-background-color: var(--pico-color-red-500);
      --pico-border-color: var(--pico-color-red-500);
    }
  </style>
</head>
<body>
  <header class="container">
    <nav>
      <ul><li><strong><a href="/requirements">MATRIX</a></strong></li></ul>
      <ul>
        <li><a href="/requirements">Requirements</a></li>
      </ul>
    </nav>
  </header>
  <main class="container">
    ${body}
  </main>
  <footer class="container">
    <small>MATRIX</small>
  </footer>
</body>
</html>`;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
