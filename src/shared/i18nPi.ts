/** English texts of the Raspberry Pi notes by the Pi's preset (renderer/piNotes.ts and its window). */
export const PI_EN: Record<string, string> = {
  'Raspberry Pi – co warto wiedzieć': 'Raspberry Pi – good to know',
  'Lithium i inne, bez Sodium (zawiesza grafikę Pi), instalowane przy zapisie': "Lithium and others, no Sodium (it stalls the Pi's graphics), installed on saving",
  'Grafika na karcie Pi': "Graphics on the Pi's chip",
  'Z „Poprawką grafiki dla Raspberry Pi” gra rysuje kartą graficzną Pi przez OpenGL i trzyma limit presetu (30 FPS). Bez niej Minecraft 26.x rysuje przez Vulkan liczony przez procesor: 10–15 FPS przy mocno zajętym procesorze.':
    "With \"The Raspberry Pi's graphics fix\" the game draws with the Pi's graphics chip through OpenGL and holds the preset's limit (30 FPS). Without it Minecraft 26.x draws through a Vulkan done by the processor: 10–15 FPS with the processor working hard.",
  'Bez Sodium': 'No Sodium',
  'Sodium zawiesza sterownik grafiki Pi: na serwerach, gdzie bloki ciągle się zmieniają, gra spada do 0 FPS, a z nowszym sterownikiem potrafi zawiesić całą kartę razem z pulpitem. Preset go nie instaluje. Jeśli masz Sodium z wcześniejszych wersji launchera, wyłącz je na liście modów profilu.':
    "Sodium stalls the Pi's graphics driver: on servers where blocks change all the time the game drops to 0 FPS, and with a newer driver it can hang the whole graphics chip along with the desktop. The preset does not install it. If you have Sodium from earlier launcher versions, switch it off in the profile's mod list.",
  'Duże paczki zasobów serwerów': "Servers' big resource packs",
  'Karta Pi przyjmuje tekstury do 4096 pikseli. Gdy paczka serwera potrzebuje większych, gra ją odrzuca („Unable to fit”) i grasz bez niej. Bez „Poprawki grafiki” paczka się wczyta, ale za cenę połowy FPS.':
    "The Pi's graphics chip takes textures up to 4096 pixels. When a server's pack needs bigger ones, the game drops it (\"Unable to fit\") and you play without it. Without the graphics fix the pack loads, at the cost of half the FPS.",
  'Myszka przez VNC i Raspberry Pi Connect': 'The mouse over VNC and Raspberry Pi Connect',
  'Na Raspberry Pi OS z nowym pulpitem (labwc 0.20) kamera nie reaguje na myszkę z VNC, a bez „Poprawki grafiki” nawet zwykła myszka wraca na miejsce. Graj myszką podłączoną do Pi, z włączoną poprawką.':
    "On Raspberry Pi OS with the new desktop (labwc 0.20) the camera does not follow a mouse over VNC, and without the graphics fix even a plain mouse snaps back. Play with a mouse plugged into the Pi, with the fix on.",
  'Vulkan na karcie Pi': "Vulkan on the Pi's chip",
  'Minecraft 26.x wymaga od Vulkana funkcji, których sterownik Pi jeszcze nie ma (także w Mesa 26.2), dlatego preset uruchamia grę na OpenGL.':
    "Minecraft 26.x needs Vulkan features the Pi's driver does not have yet (Mesa 26.2 included), so the preset runs the game on OpenGL.",
  'Pierwsze minuty': 'The first minutes',
  'Zaraz po starcie Java kompiluje grę na wszystkich rdzeniach i gra może się przycinać. Gra dostaje niższy priorytet, żeby pulpit i zdalny pulpit się nie zacinały.':
    'Right after the start Java compiles the game on every core and the game may stutter. The game gets a lower priority so the desktop and a remote desktop stay smooth.',
};
