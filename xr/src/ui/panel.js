/**
 * The HTML control panel shown on the page (outside the headset view).
 * It owns no state: it renders what `main.js` passes to `render()` and reports
 * choices through callbacks.
 */
import { CITIES, MODES } from '../config.js';
import { CONTROL_HELP } from '../xr/controls.js';
import { aircraftRows, aircraftTitle } from './aircraftInfo.js';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value != null) node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

const LAYERS = [
  { id: 'flights', label: 'Aircraft' },
  { id: 'quakes', label: 'Earthquakes' },
];

export function createPanel(
  host,
  { onCity, onMode, onLayer, onClearSelection, onEnterXR, onKey },
) {
  const citySelect = el(
    'select',
    { id: 'city', onchange: (e) => onCity(e.target.value) },
    ...CITIES.map((c) => el('option', { value: c.id }, c.label)),
  );
  const modeButtons = Object.values(MODES).map((mode) =>
    el(
      'button',
      { type: 'button', 'data-mode': mode.id, onclick: () => onMode(mode.id) },
      mode.label,
    ),
  );
  const layerBoxes = LAYERS.map(({ id, label }) => {
    const box = el('input', {
      type: 'checkbox',
      id: `layer-${id}`,
      onchange: (e) => onLayer(id, e.target.checked),
    });
    return { id, box, row: el('label', { class: 'toggle' }, box, ` ${label}`) };
  });
  const enter = el(
    'button',
    { type: 'button', class: 'primary', onclick: onEnterXR },
    'Enter VR',
  );
  const keyInput = el('input', {
    type: 'password',
    placeholder: 'Google Maps API key (optional)',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const keyForm = el(
    'form',
    {
      class: 'key',
      onsubmit: (e) => {
        e.preventDefault();
        onKey(keyInput.value.trim());
        keyInput.value = '';
      },
    },
    keyInput,
    el('button', { type: 'submit' }, 'Use key'),
    el('button', { type: 'button', onclick: () => onKey('') }, 'Clear'),
  );

  const selectedTitle = el('h2');
  const selectedList = el('dl');
  const selectedBox = el(
    'section',
    { class: 'selected', 'aria-live': 'polite' },
    selectedTitle,
    selectedList,
    el('button', { type: 'button', onclick: onClearSelection }, 'Clear'),
  );
  const selectedHint = el(
    'p',
    { class: 'hint' },
    'Hover an aircraft (or aim a controller at it in VR) to see its details.',
  );

  const tilesLine = el('p', { class: 'status' });
  const flightsLine = el('p', { class: 'status' });
  const quakesLine = el('p', { class: 'status' });
  const xrLine = el('p', { class: 'status' });
  const credits = el('p', { class: 'credits' });

  const panel = el(
    'aside',
    { class: 'panel', 'aria-label': 'God’s Eye View XR controls' },
    el('h1', {}, 'God’s Eye View ', el('span', {}, 'XR')),
    el('label', { for: 'city' }, 'Focus city'),
    citySelect,
    el(
      'div',
      { class: 'modes', role: 'group', 'aria-label': 'View mode' },
      ...modeButtons,
    ),
    el(
      'div',
      { class: 'layers', role: 'group', 'aria-label': 'Layers' },
      ...layerBoxes.map((l) => l.row),
    ),
    enter,
    xrLine,
    selectedBox,
    selectedHint,
    el(
      'details',
      {},
      el('summary', {}, 'Controls'),
      el(
        'p',
        { class: 'hint' },
        'No headset? In desktop Chrome, Enter VR opens an emulated Quest 3. Drag the arrows on a controller to aim it, and use the Press / Hold buttons in its panel (Hold keeps a button down). Switch the emulator to hands to try pinch.',
      ),
      el(
        'dl',
        { class: 'help' },
        ...CONTROL_HELP.flatMap(([input, action]) => [
          el('dt', {}, input),
          el('dd', {}, action),
        ]),
      ),
    ),
    el(
      'details',
      {},
      el('summary', {}, 'Photorealistic 3D tiles'),
      keyForm,
      el(
        'p',
        { class: 'hint' },
        'Your key stays in this browser. Restrict it by HTTP referrer in Google Cloud.',
      ),
    ),
    tilesLine,
    flightsLine,
    quakesLine,
    credits,
  );
  host.append(panel);

  return {
    render({
      city,
      mode,
      layers,
      selected,
      tiles,
      flights,
      quakes,
      xr,
      attributions,
    }) {
      citySelect.value = city.id;
      for (const button of modeButtons)
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.mode === mode.id),
        );
      for (const { id, box } of layerBoxes) box.checked = layers[id];

      selectedBox.hidden = !selected;
      selectedHint.hidden = Boolean(selected);
      if (selected) {
        selectedTitle.textContent = aircraftTitle(selected);
        selectedList.replaceChildren(
          ...aircraftRows(selected).flatMap(([label, value]) => [
            el('dt', {}, label),
            el('dd', {}, value),
          ]),
        );
      }

      tilesLine.textContent = `Surface: ${tiles.attribution}`;
      flightsLine.textContent = flights
        ? flights.ok
          ? `Aircraft: ${flights.count} within range (${flights.source})`
          : `Aircraft: unavailable — ${flights.error}`
        : 'Aircraft: loading…';
      quakesLine.textContent = quakes
        ? quakes.ok
          ? `Earthquakes: ${quakes.count} (USGS, M2.5+, past day)`
          : `Earthquakes: unavailable — ${quakes.error}`
        : 'Earthquakes: loading…';
      xrLine.textContent = xr;
      enter.disabled = xr !== 'Ready';
      credits.textContent = attributions.length
        ? `Imagery: ${attributions.join(' · ')}`
        : '';
    },
  };
}
