import { t } from '../shared/i18n';
import { el } from './dialog';

/**
 * "Raspberry Pi – co warto wiedzieć": what we learned about the game on the Pi, behind a button by the
 * Pi's preset in a profile's settings – why the graphics fix, Sodium's error checks, which server packs do not
 * fit, the mouse over VNC after the system's update. Plain notes, nothing here changes settings.
 */
export function piNotes(): { icon: string; title: string; text: string }[] {
  return [
    {
      icon: 'fa-microchip', title: t('Grafika na karcie Pi'),
      text: t('Z „Poprawką grafiki dla Raspberry Pi” gra rysuje kartą graficzną Pi przez OpenGL i trzyma limit presetu (30 FPS). Bez niej Minecraft 26.x rysuje przez Vulkan liczony przez procesor: 10–15 FPS przy mocno zajętym procesorze.'),
    },
    {
      icon: 'fa-shield-halved', title: t('Sodium ze sprawdzaniem błędów'),
      text: t('Sodium domyślnie wyłącza sprawdzanie błędów sterownika grafiki. Na Pi przepuszczało wtedy za duże tekstury z paczek serwerów, a gra spadała do 0 FPS albo zawieszała kartę razem z pulpitem. Z „Poprawką grafiki” launcher przy każdym starcie włącza Sodium to sprawdzanie i gra trzyma 30 FPS.'),
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
      icon: 'fa-hourglass-half', title: t('Pierwsze minuty'),
      text: t('Zaraz po starcie Java kompiluje grę na wszystkich rdzeniach i gra może się przycinać. Gra dostaje niższy priorytet, żeby pulpit i zdalny pulpit się nie zacinały.'),
    },
  ];
}

/** The notes as rows of the window. */
export function piNoteRows(): HTMLElement[] {
  return piNotes().map((n) => el('div', { className: 'pi-note' },
    el('i', { className: `fa-solid ${n.icon}` }),
    el('div', {}, el('b', { textContent: n.title }), el('p', { className: 'muted', textContent: n.text }))));
}
