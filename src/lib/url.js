// Turning what the user types into a URL, and showing a URL. Kept free of Electron so it can be
// unit tested.

const HOME_URL = 'https://www.google.com';
const SEARCH_URL = 'https://www.google.com/search?q=';
const BLANK_URL = 'about:blank'; // new tabs start here, with the address bar focused
const SETTINGS_URL = 'herdr://settings/';

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

module.exports = { HOME_URL, SEARCH_URL, BLANK_URL, SETTINGS_URL, normalizeUrl, displayUrl };
