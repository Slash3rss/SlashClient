package dev.slash3rss.slashclient.hud;

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
		if (!available(mc)) throw new IllegalStateException("Account switching only works in the menu");
		//#if MC >= 1.21.9
		User user = new User(name, uuid, token, Optional.ofNullable(xuid).filter(x -> !x.isBlank() && !x.equals("0")), Optional.empty());
		//#else
		//$ User user = new User(name, uuid, token, Optional.ofNullable(xuid).filter(x -> !x.isBlank() && !x.equals("0")), Optional.empty(), User.Type.MSA);
		//#endif
		UserApiService api = offline ? UserApiService.OFFLINE : apiFor(token);
		MinecraftAccessor access = (MinecraftAccessor) mc;
		access.slashclient$setUser(user);
		access.slashclient$setUserApiService(api);
		access.slashclient$setUserProperties(CompletableFuture.supplyAsync(() -> {
			try {
				return api.fetchProperties();
			} catch (Exception e) {
				return UserApiService.OFFLINE_PROPERTIES;
			}
		}));
		access.slashclient$setProfileKeyPairManager(ProfileKeyPairManager.create(api, user, mc.gameDirectory.toPath()));
		access.slashclient$setReportingContext(ReportingContext.create(ReportEnvironment.local(), api));
		//#if MC < 26.2
		//$ access.slashclient$setPlayerSocialManager(new PlayerSocialManager(mc, api));
		//#endif
		// from 26.2 the block list also runs the game's own friends: it stays until the next start
		access.slashclient$setProfileFuture(CompletableFuture.supplyAsync(() -> mc.services().sessionService().fetchProfile(uuid, true)));
		SlashHud.LOG.info("SlashClient: playing as {} now", name);
	}
}
