/**
 * Which Java a profile plays on: Mojang's own runtime (the default) or an OpenJDK build of
 * another vendor, downloaded by the launcher from the vendor's official API (src/main/javaVendors.ts).
 */
export type JavaVendor = 'mojang' | 'temurin' | 'graalvm' | 'zulu';

export const JAVA_VENDORS: JavaVendor[] = ['mojang', 'temurin', 'graalvm', 'zulu'];

/** Names shown in the launcher (the same in both languages, except Mojang's: a key for t()). */
export const JAVA_VENDOR_NAMES: Record<JavaVendor, string> = {
  mojang: 'Mojang (domyślna)',
  temurin: 'Eclipse Temurin',
  graalvm: 'GraalVM Community',
  zulu: 'Azul Zulu',
};

export const isJavaVendor = (v: unknown): v is JavaVendor => typeof v === 'string' && (JAVA_VENDORS as string[]).includes(v);

/** The vendor a profile plays on: its own choice, else the default from Settings, else Mojang's. */
export function effectiveJavaVendor(profileVendor: string | undefined, defaultVendor: string | undefined): JavaVendor {
  if (isJavaVendor(profileVendor)) return profileVendor;
  return isJavaVendor(defaultVendor) ? defaultVendor : 'mojang';
}
