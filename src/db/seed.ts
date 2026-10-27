import { crc32, deflateSync } from 'node:zlib';
import { inArray, sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { hashPassword } from '../lib/password.js';
import { createDb } from './client.js';
import { products, users } from './schema.js';

// The demo password is public, so never create these accounts in production.
if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV is production.');
  process.exit(1);
}

const SEED_PASSWORD = 'password123';

const seedUsers = [
  { email: 'ada@example.com', name: 'Ada Lovelace' },
  { email: 'alan@example.com', name: 'Alan Turing' },
];

// owner is an index into seedUsers; color null means the product has no image.
const seedProducts: { owner: number; name: string; description: string; priceCents: number; color: string | null }[] = [
  { owner: 0, name: 'Desk lamp', description: 'Adjustable LED lamp with warm and cool light.', priceCents: 3499, color: '#f2c14e' },
  { owner: 0, name: 'Mechanical keyboard', description: 'Tenkeyless, brown switches, USB-C.', priceCents: 8999, color: '#3d5a80' },
  { owner: 0, name: 'Wireless mouse', description: 'Silent clicks, two-month battery.', priceCents: 2499, color: '#98c1d9' },
  { owner: 0, name: 'Laptop stand', description: 'Aluminium stand that raises the screen to eye level.', priceCents: 3999, color: '#adb5bd' },
  { owner: 0, name: 'USB-C hub', description: 'HDMI, two USB-A ports and an SD card reader.', priceCents: 2999, color: null },
  { owner: 0, name: 'Noise-cancelling headphones', description: 'Over-ear, 30 hours of playback.', priceCents: 19900, color: '#293241' },
  { owner: 0, name: 'Webcam', description: '1080p webcam with a privacy shutter.', priceCents: 4999, color: '#ee6c4d' },
  { owner: 0, name: 'Monitor arm', description: 'Gas-spring arm for screens up to 32 inches.', priceCents: 6999, color: null },
  { owner: 0, name: 'Desk mat', description: 'Large felt mat that protects the desk and quiets typing.', priceCents: 1999, color: '#6c757d' },
  { owner: 0, name: 'Cable organizer', description: 'Set of reusable silicone cable clips.', priceCents: 899, color: '#e0fbfc' },
  { owner: 0, name: 'Ergonomic chair', description: 'Mesh back with adjustable lumbar support.', priceCents: 24900, color: '#343a40' },
  { owner: 0, name: 'Standing desk', description: 'Electric height-adjustable desk with memory presets.', priceCents: 45900, color: '#8d6e63' },
  { owner: 1, name: 'Ceramic coffee mug', description: 'Handmade mug, holds 350 ml.', priceCents: 1499, color: '#d4a373' },
  { owner: 1, name: 'Pour-over coffee set', description: 'Glass dripper, carafe and 100 paper filters.', priceCents: 3299, color: '#bc6c25' },
  { owner: 1, name: 'Notebook', description: 'A5 dotted notebook with 192 pages.', priceCents: 1299, color: '#606c38' },
  { owner: 1, name: 'Fountain pen', description: 'Steel nib fountain pen with converter.', priceCents: 2799, color: '#283618' },
  { owner: 1, name: 'Water bottle', description: 'Insulated steel bottle, keeps drinks cold for 24 hours.', priceCents: 2299, color: '#4ea8de' },
  { owner: 1, name: 'Backpack', description: 'Water-resistant backpack with a padded laptop sleeve.', priceCents: 7999, color: '#264653' },
  { owner: 1, name: 'Plant pot', description: 'Matte ceramic pot with drainage tray.', priceCents: 1799, color: '#2a9d8f' },
  { owner: 1, name: 'Bluetooth speaker', description: 'Portable speaker, waterproof, 12 hours of playback.', priceCents: 5999, color: '#e76f51' },
  { owner: 1, name: 'Phone stand', description: 'Foldable stand for phones and small tablets.', priceCents: 999, color: null },
  { owner: 1, name: 'Wall clock', description: 'Silent quartz clock, 30 cm.', priceCents: 2599, color: '#f4a261' },
  { owner: 1, name: 'Throw blanket', description: 'Soft knitted cotton blanket.', priceCents: 3999, color: '#e9c46a' },
  { owner: 1, name: 'Scented candle', description: 'Soy wax candle, cedar and vanilla.', priceCents: 1599, color: null },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Base64 of a square PNG filled with one color, so seed images need no binary files in the repo. */
function solidPng(hexColor: string, size = 64): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hexColor.slice(i, i + 2), 16));

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // truecolor RGB

  // Each row starts with filter type 0 (none).
  const row = Buffer.from([0, ...Array.from({ length: size }, () => rgb).flat()]);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

const passwordHash = await hashPassword(SEED_PASSWORD);
const { db, pool } = createDb(env.DATABASE_URL);

try {
  await db.transaction(async (tx) => {
    // Upsert so re-running resets the demo users' name and password instead of failing.
    const owners = await tx
      .insert(users)
      .values(seedUsers.map((user) => ({ ...user, passwordHash })))
      .onConflictDoUpdate({ target: users.email, set: { name: sql`excluded.name`, passwordHash } })
      .returning({ id: users.id, email: users.email });
    const ownerIds = seedUsers.map(({ email }) => owners.find((owner) => owner.email === email)!.id);

    // Replace the demo users' products so re-running doesn't create duplicates.
    await tx.delete(products).where(inArray(products.ownerId, ownerIds));

    // Stagger createdAt so "newest first" lists them in a stable order, first product on top.
    const now = Date.now();
    await tx.insert(products).values(
      seedProducts.map(({ owner, color, ...product }, i) => ({
        ...product,
        ownerId: ownerIds[owner]!,
        imageMimeType: color ? 'image/png' : null,
        imageBase64: color ? solidPng(color) : null,
        createdAt: new Date(now - i * 60_000),
        updatedAt: new Date(now - i * 60_000),
      })),
    );
  });

  console.log(`Seeded ${seedUsers.length} users and ${seedProducts.length} products.`);
  console.log(`Log in as ${seedUsers.map(({ email }) => email).join(' or ')} with password "${SEED_PASSWORD}".`);
} finally {
  await pool.end();
}
