package dev.slash3rss.slashclient.hud.compat;

//#if MC < 1.21.9
//$ /**
//$  * Before 1.21.9 the game passed a click as (x, y, button); this stands in for its later
//$  * MouseButtonEvent (versions/<mc>.properties points the imports here), so screens read the same.
//$  */
//$ public record MouseButtonEvent(double x, double y, int button) {}
//#endif
