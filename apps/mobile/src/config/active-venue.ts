import { parseVenuePackage } from '@turn/venue-model';
import data from './venue.generated.json';

export const activeVenue = parseVenuePackage(data);
