import { t } from '../shared/i18n';

/**
 * Well-known performance mods per loader, as Modrinth slugs. Each entry is a list of
 * alternatives: the first one that has a version for the profile wins (e.g. Sodium,
 * or Embeddium where Sodium is not available), so two renderers never end up together.
 */
export const PERF_MODS: Record<string, { slugs: string[]; why: string }[]> = {
  fabric: [
    { slugs: ['sodium'], why: 'szybsze renderowanie' },
    { slugs: ['lithium'], why: 'szybsza logika gry' },
    { slugs: ['ferrite-core'], why: 'mniej pamięci' },
    { slugs: ['entityculling'], why: 'nie rysuje niewidocznych bytów' },
    { slugs: ['immediatelyfast'], why: 'szybsze GUI i tekst' },
    { slugs: ['dynamic-fps'], why: 'mniej FPS w tle' },
    { slugs: ['modmenu'], why: 'lista modów w grze' },
  ],
  neoforge: [
    { slugs: ['sodium', 'embeddium'], why: 'szybsze renderowanie' },
    { slugs: ['ferrite-core'], why: 'mniej pamięci' },
    { slugs: ['modernfix'], why: 'szybszy start' },
    { slugs: ['entityculling'], why: 'nie rysuje niewidocznych bytów' },
    { slugs: ['immediatelyfast'], why: 'szybsze GUI i tekst' },
    { slugs: ['dynamic-fps'], why: 'mniej FPS w tle' },
  ],
  forge: [
    { slugs: ['embeddium', 'rubidium'], why: 'szybsze renderowanie' },
    { slugs: ['ferrite-core'], why: 'mniej pamięci' },
    { slugs: ['modernfix'], why: 'szybszy start' },
    { slugs: ['entityculling'], why: 'nie rysuje niewidocznych bytów' },
    { slugs: ['immediatelyfast'], why: 'szybsze GUI i tekst' },
    { slugs: ['dynamic-fps'], why: 'mniej FPS w tle' },
  ],
};
PERF_MODS.quilt = PERF_MODS.fabric;

export function perfModsFor(loader: string): { slugs: string[]; why: string }[] {
  const list = PERF_MODS[loader];
  if (!list) throw new Error(t('Mody wydajności wymagają mod loadera. Ustaw Fabric w ustawieniach profilu.'));
  return list;
}
