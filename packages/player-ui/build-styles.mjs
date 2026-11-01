import { copyFile } from 'node:fs/promises';

// Keep the public stylesheet and its relative import together in the package output.
for (const file of ['player.css', 'gallery.css']) {
  await copyFile(new URL(`./src/${file}`, import.meta.url), new URL(`./dist/${file}`, import.meta.url));
}
