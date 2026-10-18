// Renders the TURN mark into every icon and splash size the apps need (Plan 003 F1).
// Usage: npm run brand:assets
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { glyphSvg, lockupSvg, markSvg, palette } from '@turn/design';

const png = (svg: string, size: number) =>
  sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toBuffer();

async function main() {
  const nav = 'apps/navigator/assets';
  const consolePublic = 'apps/console/public';
  const brand = 'docs/brand';
  for (const d of [nav, consolePublic, brand])
    await mkdir(d, { recursive: true });

  // iOS app icon: full-bleed square (the OS applies its own corner mask).
  await writeFile(
    `${nav}/icon.png`,
    await png(markSvg({ size: 1024, rounded: false }), 1024),
  );
  // Android adaptive icon: glyph on a transparent layer inside the 66% safe zone, ink background.
  await writeFile(
    `${nav}/adaptive-foreground.png`,
    await png(glyphSvg({ size: 1024, stroke: '#FFFFFF', padding: 26 }), 1024),
  );
  await writeFile(
    `${nav}/adaptive-monochrome.png`,
    await png(
      glyphSvg({ size: 1024, stroke: '#FFFFFF', dot: '#FFFFFF', padding: 26 }),
      1024,
    ),
  );
  // Splash: the tile mark centred on paper.
  await writeFile(
    `${nav}/splash-icon.png`,
    await png(markSvg({ size: 512 }), 512),
  );
  await writeFile(`${nav}/favicon.png`, await png(markSvg({ size: 48 }), 48));

  await writeFile(`${consolePublic}/favicon.svg`, markSvg());
  await writeFile(`${consolePublic}/logo.svg`, lockupSvg({ height: 40 }));
  await writeFile(`${brand}/mark.svg`, markSvg());
  await writeFile(
    `${brand}/mark-light.svg`,
    markSvg({ tile: palette.paper, stroke: palette.ink }),
  );
  await writeFile(`${brand}/glyph.svg`, glyphSvg());
  await writeFile(`${brand}/lockup.svg`, lockupSvg({ height: 40 }));
  await writeFile(
    `${brand}/mark-512.png`,
    await png(markSvg({ size: 512 }), 512),
  );
  console.log('Brand assets written to', nav, consolePublic, brand);
}
void main();
