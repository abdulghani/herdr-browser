// Turning what the user types into a URL, and showing a URL. Kept free of Electrobun so it can be
// unit tested.

const HOME_URL = 'https://www.google.com';
const SEARCH_URL = 'https://www.google.com/search?q=';
const BLANK_URL = 'about:blank'; // new tabs start here, with the address bar focused
const SETTINGS_URL = 'herdr://settings/';
// The built pages are copied into the app and served as views://ui/<page>/index.html (see
// electrobun.config.ts). herdr://settings is what tabs and the address bar show for the settings page.
const VIEWS_SETTINGS = 'views://ui/settings/index.html';

// Address bar text -> URL: a URL with a scheme as is, something that looks like a host gets
// http(s)://, anything else is searched for.
function normalizeUrl(input) {
  const text = input.trim();
  if (!text) return HOME_URL;
  // A scheme, but not a host with a port like localhost:3000.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return text;
  if (/^localhost(:\d+)?(\/|$)/.test(text) || /^[\d.]+(:\d+)?(\/|$)/.test(text)) return `http://${text}`;
  if (!/\s/.test(text) && /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text)) return `https://${text}`;
  return SEARCH_URL + encodeURIComponent(text);
}

// What the address bar shows for a URL: no scheme, "www." or trailing slash.
const displayUrl = (url) =>
  url
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

// What a tab's page actually loads: herdr://settings/#about -> views://ui/settings/index.html#about.
function pageUrl(url) {
  const match = /^herdr:\/\/settings\/?(#.*)?$/i.exec(url);
  return match ? VIEWS_SETTINGS + (match[1] || '') : url;
}

// The other way round, for the address bar: a views:// settings page shows as herdr://settings/.
const tabUrl = (url) => (url.startsWith(VIEWS_SETTINGS) ? SETTINGS_URL + url.slice(VIEWS_SETTINGS.length) : url);

module.exports = { HOME_URL, SEARCH_URL, BLANK_URL, SETTINGS_URL, normalizeUrl, displayUrl, pageUrl, tabUrl };
