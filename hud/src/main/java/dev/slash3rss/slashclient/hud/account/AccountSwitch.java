package dev.slash3rss.slashclient.hud.account;

import dev.slash3rss.slashclient.hud.SlashHud;

import com.mojang.authlib.minecraft.UserApiService;
import dev.slash3rss.slashclient.hud.mixin.MinecraftAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.User;
//#if MC < 26.2
//$ import net.minecraft.client.gui.screens.social.PlayerSocialManager;
//#endif
import net.minecraft.client.multiplayer.ProfileKeyPairManager;
import net.minecraft.client.multiplayer.chat.report.ReportEnvironment;
import net.minecraft.client.multiplayer.chat.report.ReportingContext;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Switching accounts without restarting, like other clients do: only in the menus (never on a
 * server or in a world), the game gets a new session and everything made from it - the account
 * service, the chat signing keys, reports, the block list and the profile with its skin.
 * The launcher supplies the account (a fresh Microsoft token) when the player picks it.
 * The same swap, for the same account with a new token, keeps the session alive (SessionRenew).
 */
public final class AccountSwitch {
	private AccountSwitch() {}

	/** The game's own login service, kept at start by AuthServiceMixin. */
	public static Object authService;

	public static boolean available(Minecraft mc) {
		return authService != null && mc.level == null && mc.getConnection() == null;
	}

	private static UserApiService apiFor(String token) throws Exception {
		//#if MC >= 26.3
		return ((com.mojang.authlib.services.MinecraftServicesDiscoveryService) authService).createUserApiService(token);
		//#else
		//$ return ((com.mojang.authlib.yggdrasil.YggdrasilAuthenticationService) authService).createUserApiService(token);
		//#endif
	}

	/** Makes the game play as this account from now on. */
	public static void apply(Minecraft mc, String name, UUID uuid, String token, String xuid, boolean offline) throws Exception {
		swap(mc, name, uuid, token, xuid, offline, true);
		SlashHud.LOG.info("SlashClient: playing as {} now", name);
	}

	/**
	 * The same account with a fresh token (the old one runs out after about a day): everything bound to
	 * the token is made anew; the profile with its skin stays, it is the same player.
	 */
	public static void renew(Minecraft mc, String name, UUID uuid, String token, String xuid, boolean offline) throws Exception {
		swap(mc, name, uuid, token, xuid, offline, false);
		SlashHud.LOG.info("SlashClient: session of {} renewed", name);
	}

	private static void swap(Minecraft mc, String name, UUID uuid, String token, String xuid, boolean offline, boolean newProfile) throws Exception {
		if (!available(mc)) throw new IllegalStateException("Account switching only works in the menu");
		//#if MC >= 1.21.9
		User user = new User(name, uuid, token, Optional.ofNullable(xuid).filter(x -> !x.isBlank() && !x.equals("0")), Optional.empty());
		//#elif MC >= 1.20.2
		//$ User user = new User(name, uuid, token, Optional.ofNullable(xuid).filter(x -> !x.isBlank() && !x.equals("0")), Optional.empty(), User.Type.MSA);
		//#else
		//$ User user = new User(name, uuid.toString().replace("-", ""), token, Optional.ofNullable(xuid).filter(x -> !x.isBlank() && !x.equals("0")), Optional.empty(), User.Type.MSA);
		//#endif
		UserApiService api = offline ? UserApiService.OFFLINE : apiFor(token);
		MinecraftAccessor access = (MinecraftAccessor) mc;
		access.slashclient$setUser(user);
		access.slashclient$setUserApiService(api);
		// 1.20.1 asks the service for the properties when it needs them, and has no profile future
		//#if MC >= 1.20.2
		access.slashclient$setUserProperties(CompletableFuture.supplyAsync(() -> {
			try {
				return api.fetchProperties();
			} catch (Exception e) {
				return UserApiService.OFFLINE_PROPERTIES;
			}
		}));
		//#endif
		access.slashclient$setProfileKeyPairManager(ProfileKeyPairManager.create(api, user, mc.gameDirectory.toPath()));
		access.slashclient$setReportingContext(ReportingContext.create(ReportEnvironment.local(), api));
		//#if MC < 26.2
		//$ access.slashclient$setPlayerSocialManager(new PlayerSocialManager(mc, api));
		//#endif
		// from 26.2 the block list also runs the game's own friends: it stays until the next start
		//#if MC >= 1.20.2
		if (newProfile) access.slashclient$setProfileFuture(CompletableFuture.supplyAsync(() -> mc.services().sessionService().fetchProfile(uuid, true)));
		//#endif
	}
}
