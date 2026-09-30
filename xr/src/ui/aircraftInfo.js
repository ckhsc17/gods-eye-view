/**
 * What to say about one aircraft. Pure formatting over the parent app's live
 * aircraft record (see src/sources/live/contract.js): metres, m/s and Unix ms
 * in, aviation units out.
 */

const M_TO_FT = 3.28084;
const MPS_TO_KT = 1.943844;
const MPS_TO_FPM = 196.8504;

const round = (value, step = 1) => Math.round(value / step) * step;

/** Title line: callsign, else registration, else the ICAO hex. */
export function aircraftTitle(record) {
  return record.callsign || record.registration || record.id.toUpperCase();
}

/** Ordered [label, value] rows; unknown values are left out. */
export function aircraftRows(record, nowMs = Date.now()) {
  const rows = [];
  const type = [record.typeCode, record.registration]
    .filter(Boolean)
    .join(' · ');
  if (type) rows.push(['Aircraft', type]);
  if (record.operator) rows.push(['Operator', record.operator]);
  if (record.onGround) rows.push(['Altitude', 'On ground']);
  else if (record.baroAltitudeM != null)
    rows.push([
      'Altitude',
      `${round(record.baroAltitudeM * M_TO_FT, 100).toLocaleString('en-US')} ft`,
    ]);
  if (record.speedMps != null)
    rows.push(['Speed', `${round(record.speedMps * MPS_TO_KT)} kt`]);
  if (record.courseDeg != null)
    rows.push([
      'Track',
      `${String(round(record.courseDeg) % 360).padStart(3, '0')}°`,
    ]);
  if (!record.onGround && record.verticalRateMps != null) {
    const fpm = round(record.verticalRateMps * MPS_TO_FPM, 50);
    rows.push([
      'Vertical',
      fpm === 0 ? 'Level' : `${fpm > 0 ? '+' : ''}${fpm} fpm`,
    ]);
  }
  if (record.positionTimeMs != null) {
    const age = Math.max(0, Math.round((nowMs - record.positionTimeMs) / 1000));
    rows.push(['Fix age', `${age} s`]);
  }
  rows.push(['ICAO', record.id.toUpperCase()]);
  return rows;
}
