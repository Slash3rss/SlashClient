// The website's 3D cosmetics preview: the launcher's own code (skinview3d, the pets' models, the
// particles and the icons), bundled into server/web/vendor/preview3d.js by scripts/build-web.mjs.
import { IdleAnimation, SkinViewer } from 'skinview3d';
import { CosmeticPreview, cosmeticIcon } from '../renderer/cosmeticPreview';
import { gameIcon } from '../renderer/gameIcon';

(window as unknown as { SlashPreview: unknown }).SlashPreview = { SkinViewer, IdleAnimation, CosmeticPreview, cosmeticIcon, gameIcon };
