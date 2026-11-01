import { t } from '../shared/i18n';
import { el, icon, modalWindow } from './dialog';

/**
 * "Raspberry Pi – co warto wiedzieć": what we learned about the game on the Pi, behind a button by the
 * Pi's preset in a profile's settings and in the wizards – the graphics fix, the frame limit, Sodium's error
 * checks, server packs that do not fit, the mouse over VNC, Java, the system's updates, cooling and other ARM
 * boards. Plain notes, nothing here changes settings.
 */
export function piNotes(): { icon: string; title: string; text: string }[] {
  return [
    {
      icon: 'fa-microchip', title: t('Grafika na karcie Pi'),
      text: t('Z „Poprawką grafiki dla Raspberry Pi” gra rysuje kartą graficzną Pi przez OpenGL, a okno gry otwiera się prosto na Waylandzie (przez XWayland Pi nie ma sprzętowego OpenGL). Bez niej Minecraft 26.x rysuje przez Vulkan liczony przez procesor: 10–15 FPS przy mocno zajętym procesorze.'),
    },
    {
      icon: 'fa-gauge', title: t('30 czy 60 FPS'),
      text: t('Preset trzyma 30 FPS z synchronizacją pionową. Po odznaczeniu „Limit 30 FPS” w ustawieniach profilu limit to 60: Pi 5 trzyma wtedy na zatłoczonym serwerze ok. 45–50 FPS, ale procesor pracuje mocniej i Pi bardziej się grzeje.'),
    },
    {
      icon: 'fa-shield-halved', title: t('Sodium ze sprawdzaniem błędów'),
      text: t('Sodium domyślnie wyłącza sprawdzanie błędów sterownika grafiki. Na Pi przepuszczało wtedy za duże tekstury z paczek serwerów, a gra spadała do 0 FPS albo zawieszała kartę razem z pulpitem. Z „Poprawką grafiki” launcher przy każdym starcie włącza Sodium to sprawdzanie.'),
    },
    {
      icon: 'fa-images', title: t('Duże paczki zasobów serwerów'),
      text: t('Karta Pi przyjmuje tekstury do 4096 pikseli, a duże paczki serwerów potrzebują więcej. Sama gra odrzuciłaby wtedy całą paczkę („Unable to fit”), więc SlashClient zmniejsza o połowę jej największe tekstury, aż się zmieszczą: paczka działa, tylko te obrazki są trochę mniej ostre.'),
    },
    {
      icon: 'fa-computer-mouse', title: t('Myszka przez VNC i Raspberry Pi Connect'),
      text: t('Na Raspberry Pi OS z nowym pulpitem (labwc 0.20) kamera nie reaguje na myszkę z VNC, a bez „Poprawki grafiki” nawet zwykła myszka wraca na miejsce. Graj myszką podłączoną do Pi, z włączoną poprawką.'),
    },
    {
      icon: 'fa-cube', title: t('Vulkan na karcie Pi'),
      text: t('Minecraft 26.x wymaga od Vulkana funkcji, których sterownik Pi jeszcze nie ma (także w Mesa 26.2), dlatego preset uruchamia grę na OpenGL.'),
    },
    {
      icon: 'fa-mug-hot', title: t('Java dla ARM'),
      text: t('Mojang nie wydaje Javy dla Linuksa na ARM, więc launcher sam pobiera Eclipse Temurin i biblioteki gry dla ARM. Pierwsze uruchomienie trwa przez to dłużej.'),
    },
    {
      icon: 'fa-sliders', title: t('Co zmienia preset'),
      text: t('Zasięg widzenia 4, szybka grafika bez chmur, cieni i okluzji, mało cząsteczek, do 2 GB pamięci dla gry (1,5 GB na Pi z 4 GB RAM) i niższy priorytet gry. Po wyłączeniu presetu wracają Twoje ustawienia grafiki, a każdą część presetu można wyłączyć osobno.'),
    },
    {
      icon: 'fa-rotate', title: t('Aktualizacje Raspberry Pi OS'),
      text: t('Nowsze sterowniki (Mesa 26.2) działają z presetem i przyspieszają grę bez „Poprawki grafiki” (ok. 15 zamiast 9 FPS). Ta sama aktualizacja przynosi jednak nowy pulpit, z którym nie działa myszka przez VNC.'),
    },
    {
      icon: 'fa-temperature-half', title: t('Chłodzenie i zasilanie'),
      text: t('Pi 5 zwalnia procesor, gdy się przegrzeje albo dostaje za mało prądu. Do gry przydaje się aktywne chłodzenie i oficjalny zasilacz 27 W.'),
    },
    {
      icon: 'fa-gauge-high', title: t('Benchmark'),
      text: t('W ustawieniach profilu, w części „Wydajność”, benchmark zmierzy FPS na scenie testowej i podpowie, co poprawić. Wynik można udostępnić linkiem.'),
    },
    {
      icon: 'fa-hourglass-half', title: t('Pierwsze minuty'),
      text: t('Zaraz po starcie Java kompiluje grę na wszystkich rdzeniach i gra może się przycinać. Gra dostaje niższy priorytet, żeby pulpit i zdalny pulpit się nie zacinały.'),
    },
    {
      icon: 'fa-server', title: t('Inne płytki ARM (Orange Pi, Radxa)'),
      text: t('Ten preset jest dla Raspberry Pi. Płytki z układem RK3588 (np. Orange Pi 5, Radxa ROCK 5) rysują grę własnym Vulkanem (sterownik panvk), a wymuszony OpenGL tam nie startuje, dlatego launcher poleca im „Bardzo lekki”. Synchronizacja pionowa trzymała tam grę na 30 FPS, więc z presetem launcher ją wyłącza i gra trzyma limit presetu (60 FPS).'),
    },
  ];
}

/** The notes as rows of the window. */
export function piNoteRows(): HTMLElement[] {
  return piNotes().map((n) => el('div', { className: 'pi-note' },
    el('i', { className: `fa-solid ${n.icon}` }),
    el('div', {}, el('b', { textContent: n.title }), el('p', { className: 'muted', textContent: n.text }))));
}

/** The notes in a window over everything, the wizards included (opened from the preset's link). */
export function showPiNotes(): void {
  modalWindow(t('Raspberry Pi – co warto wiedzieć'), [el('div', { className: 'pi-notes' }, ...piNoteRows())], [], undefined, 'pi-notes-box');
}

/** The link that opens them, for the wizards' preset choice. */
export function piNotesLink(): HTMLButtonElement {
  const link = el('button', { type: 'button', className: 'wz-link' }, icon('fa-circle-info'), ' ', t('Raspberry Pi – co warto wiedzieć'));
  link.addEventListener('click', showPiNotes);
  return link;
}
