// Vercel Function: GET /api/flights?lat=..&lon=..&radius=..
import { handleFlightsRequest } from '../server/flights.js';

export function GET(request) {
  return handleFlightsRequest(request);
}
