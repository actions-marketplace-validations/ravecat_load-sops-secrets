import { isDeepStrictEqual } from 'node:util';
import { secrets } from './fixture.ts';

try {
  if (!isDeepStrictEqual(JSON.parse(process.env.ALL_OUTPUTS ?? ''), secrets)) throw new Error();
  if (process.env.DEMO_SECRET !== secrets.demo_secret) throw new Error();
  if (process.env.MULTILINE !== secrets.multiline) throw new Error();
} catch {
  throw new Error('The action did not preserve the expected synthetic step outputs.');
}
