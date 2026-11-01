/** English texts of the Raspberry Pi notes by the Pi's preset (renderer/piNotes.ts and its window) and of the preset's own switches. */
export const PI_EN: Record<string, string> = {
  'Raspberry Pi – co warto wiedzieć': 'Raspberry Pi – good to know',
  'Raspberry Pi': 'Raspberry Pi',
  'Limit 30 FPS': '30 FPS limit',
  'odznaczony: 60 FPS – płynniej (Pi 5 na serwerze ok. 45–50 FPS), ale procesor pracuje więcej i Pi mocniej się grzeje':
    'unticked: 60 FPS – smoother (a Pi 5 holds some 45–50 on a server), but the processor works harder and the Pi gets hotter',
  'Grafika na karcie Pi': "Graphics on the Pi's chip",
  'Z „Poprawką grafiki dla Raspberry Pi” gra rysuje kartą graficzną Pi przez OpenGL, a okno gry otwiera się prosto na Waylandzie (przez XWayland Pi nie ma sprzętowego OpenGL). Bez niej Minecraft 26.x rysuje przez Vulkan liczony przez procesor: 10–15 FPS przy mocno zajętym procesorze.':
    "With \"The Raspberry Pi's graphics fix\" the game draws with the Pi's graphics chip through OpenGL, and the game's window opens on Wayland itself (through XWayland the Pi has no hardware OpenGL). Without it Minecraft 26.x draws through a Vulkan done by the processor: 10–15 FPS with the processor working hard.",
  '30 czy 60 FPS': '30 or 60 FPS',
  'Preset trzyma 30 FPS z synchronizacją pionową. Po odznaczeniu „Limit 30 FPS” w ustawieniach profilu limit to 60: Pi 5 trzyma wtedy na zatłoczonym serwerze ok. 45–50 FPS, ale procesor pracuje mocniej i Pi bardziej się grzeje.':
    'The preset holds 30 FPS with vertical sync. With "30 FPS limit" unticked in the profile\'s settings the limit is 60: a Pi 5 then holds some 45–50 FPS on a busy server, but the processor works harder and the Pi gets hotter.',
  'Sodium ze sprawdzaniem błędów': 'Sodium with error checks',
  'Sodium domyślnie wyłącza sprawdzanie błędów sterownika grafiki. Na Pi przepuszczało wtedy za duże tekstury z paczek serwerów, a gra spadała do 0 FPS albo zawieszała kartę razem z pulpitem. Z „Poprawką grafiki” launcher przy każdym starcie włącza Sodium to sprawdzanie.':
    "Sodium switches the graphics driver's error checks off by default. On the Pi it then let through textures from servers' packs that were too big, and the game dropped to 0 FPS or hung the graphics chip with the desktop. With the graphics fix the launcher turns these checks back on for Sodium at every start.",
  'Duże paczki zasobów serwerów': "Servers' big resource packs",
  'Karta Pi przyjmuje tekstury do 4096 pikseli, a duże paczki serwerów potrzebują więcej. Sama gra odrzuciłaby wtedy całą paczkę („Unable to fit”), więc SlashClient zmniejsza o połowę jej największe tekstury, aż się zmieszczą: paczka działa, tylko te obrazki są trochę mniej ostre.':
    "The Pi's graphics chip takes textures up to 4096 pixels, and servers' big packs need more. The game alone would then drop the whole pack (\"Unable to fit\"), so SlashClient halves its biggest textures until they fit: the pack works, only those pictures are a little less sharp.",
  'Myszka przez VNC i Raspberry Pi Connect': 'The mouse over VNC and Raspberry Pi Connect',
  'Na Raspberry Pi OS z nowym pulpitem (labwc 0.20) kamera nie reaguje na myszkę z VNC. Włącz w grze moduł SlashClient „Myszka przez VNC”: kamera idzie wtedy za kursorem, a przy brzegu okna obraca się dalej sama. Graj na pełnym ekranie (F11), żeby kursor nie wychodził poza grę. Bez „Poprawki grafiki” nawet zwykła myszka wraca na miejsce.':
    "On Raspberry Pi OS with the new desktop (labwc 0.20) the camera does not follow a mouse over VNC. Switch on the SlashClient module \"Mouse over VNC\" in the game: the camera then follows the cursor and keeps turning at the window's edge. Play in fullscreen (F11) so the cursor does not leave the game. Without the graphics fix even a plain mouse snaps back.",
  'Vulkan na karcie Pi': "Vulkan on the Pi's chip",
  'Minecraft 26.x wymaga od Vulkana funkcji, których sterownik Pi jeszcze nie ma (także w Mesa 26.2), dlatego preset uruchamia grę na OpenGL.':
    "Minecraft 26.x needs Vulkan features the Pi's driver does not have yet (Mesa 26.2 included), so the preset runs the game on OpenGL.",
  'Java dla ARM': 'Java for ARM',
  'Mojang nie wydaje Javy dla Linuksa na ARM, więc launcher sam pobiera Eclipse Temurin i biblioteki gry dla ARM. Pierwsze uruchomienie trwa przez to dłużej.':
    "Mojang releases no Java for Linux on ARM, so the launcher downloads Eclipse Temurin and the game's libraries for ARM itself. The first start takes longer because of it.",
  'Co zmienia preset': 'What the preset changes',
  'Zasięg widzenia 4, szybka grafika bez chmur, cieni i okluzji, mało cząsteczek, do 2 GB pamięci dla gry (1,5 GB na Pi z 4 GB RAM) i niższy priorytet gry. Po wyłączeniu presetu wracają Twoje ustawienia grafiki, a każdą część presetu można wyłączyć osobno.':
    "View distance 4, fast graphics without clouds, shadows or ambient occlusion, few particles, up to 2 GB of memory for the game (1.5 GB on a Pi with 4 GB of RAM) and a lower priority for the game. Switching the preset off brings your own graphics settings back, and each part of the preset can be switched off on its own.",
  'Aktualizacje Raspberry Pi OS': 'Raspberry Pi OS updates',
  'Nowsze sterowniki (Mesa 26.2) działają z presetem i przyspieszają grę bez „Poprawki grafiki” (ok. 15 zamiast 9 FPS). Ta sama aktualizacja przynosi jednak nowy pulpit, z którym nie działa myszka przez VNC.':
    'Newer drivers (Mesa 26.2) work with the preset and speed the game up without the graphics fix (some 15 instead of 9 FPS). The same update brings the new desktop, though, with which the mouse over VNC does not work.',
  'Chłodzenie i zasilanie': 'Cooling and power',
  'Pi 5 zwalnia procesor, gdy się przegrzeje albo dostaje za mało prądu. Do gry przydaje się aktywne chłodzenie i oficjalny zasilacz 27 W.':
    'A Pi 5 slows its processor down when it overheats or gets too little power. For playing, active cooling and the official 27 W power supply help.',
  Benchmark: 'Benchmark',
  'W ustawieniach profilu, w części „Wydajność”, benchmark zmierzy FPS na scenie testowej i podpowie, co poprawić. Wynik można udostępnić linkiem.':
    'In the profile\'s settings, under "Performance", the benchmark measures FPS on a test scene and suggests what to improve. The result can be shared with a link.',
  'Pierwsze minuty': 'The first minutes',
  'Zaraz po starcie Java kompiluje grę na wszystkich rdzeniach i gra może się przycinać. Gra dostaje niższy priorytet, żeby pulpit i zdalny pulpit się nie zacinały.':
    'Right after the start Java compiles the game on every core and the game may stutter. The game gets a lower priority so the desktop and a remote desktop stay smooth.',
  'Inne płytki ARM (Orange Pi, Radxa)': 'Other ARM boards (Orange Pi, Radxa)',
  'Ten preset jest dla Raspberry Pi. Płytki z układem RK3588 (np. Orange Pi 5, Radxa ROCK 5) rysują grę własnym Vulkanem (sterownik panvk), a wymuszony OpenGL tam nie startuje, dlatego launcher poleca im „Bardzo lekki”. Synchronizacja pionowa trzymała tam grę na 30 FPS, więc z presetem launcher ją wyłącza i gra trzyma limit presetu (60 FPS).':
    'This preset is for the Raspberry Pi. Boards with the RK3588 chip (e.g. Orange Pi 5, Radxa ROCK 5) draw the game with their own Vulkan (the panvk driver), and a forced OpenGL does not start there, so the launcher suggests "Very light" for them. Vertical sync held the game at 30 FPS there, so with a preset the launcher switches it off and the game holds the preset\'s limit (60 FPS).',
};
