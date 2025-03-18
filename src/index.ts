import { config } from 'dotenv';
import path from 'path';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

config({
  path: path.resolve(process.cwd(), envFile),
});
