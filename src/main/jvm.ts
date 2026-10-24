/**
 * JVM flag presets. Stored on the profile by name and expanded at launch, so each
 * game version gets flags its Java understands (an unknown flag stops the JVM from starting).
 */
export type JvmPreset = 'default' | 'g1' | 'zgc';

/** G1 tuned for Minecraft (Aikar's flags, which are widely used for clients too). Works on Java 8+. */
const G1 = [
  '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20', '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=4', '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90', '-XX:SurvivorRatio=32', '-XX:+PerfDisableSharedMem', '-XX:MaxTenuringThreshold=1',
];

// The same flags suit every vendor's Java (javaVendors.ts): GraalVM Community already runs its own JIT
// compiler by default (UseJVMCICompiler), and its 21 and 25 builds start fine with ZGC and with G1 above.
export function presetArgs(preset: JvmPreset | undefined, javaMajor: number): string[] {
  if (preset === 'g1') return G1;
  // ZGC: very short pauses, best with plenty of RAM; needs Java 21+, older versions fall back to G1
  if (preset === 'zgc') return javaMajor >= 21 ? ['-XX:+UseZGC'] : G1;
  return [];
}

/**
 * Suggested memory for a profile: more for mod loaders and big modpacks (or what the modpack's
 * authors recommend, when more), never more than the computer can spare (4 GB stay with the
 * system) and at least 2 GB.
 */
export function recommendedMemoryMb(systemMb: number, loader: string, modCount: number, packMb = 0): number {
  const wanted = Math.max(loader === 'vanilla' ? 4096 : modCount > 150 ? 10240 : modCount > 60 ? 8192 : 6144, packMb);
  const spare = Math.max(2048, systemMb - 4096);
  return Math.max(2048, Math.floor(Math.min(wanted, spare) / 512) * 512);
}
