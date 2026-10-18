package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.authlib.minecraft.UserApiService;
import net.minecraft.client.Minecraft;
import net.minecraft.client.User;
import net.minecraft.client.gui.screens.social.PlayerSocialManager;
import net.minecraft.client.multiplayer.ProfileKeyPairManager;
import net.minecraft.client.multiplayer.chat.report.ReportingContext;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.gen.Accessor;

import java.util.concurrent.CompletableFuture;

/** What switching accounts in the menu replaces: the session and everything made from it. */
@Mixin(Minecraft.class)
public interface MinecraftAccessor {
	/** The window's title as the game makes it (for the test). */
	@org.spongepowered.asm.mixin.gen.Invoker("createTitle")
	String slashclient$createTitle();

	@Mutable
	@Accessor("user")
	void slashclient$setUser(User user);

	@Mutable
	@Accessor("userApiService")
	void slashclient$setUserApiService(UserApiService service);

	// not in 1.20.1
	//#if MC >= 1.20.2
	@Mutable
	@Accessor("userPropertiesFuture")
	void slashclient$setUserProperties(CompletableFuture<UserApiService.UserProperties> properties);
	//#endif

	@Mutable
	@Accessor("profileKeyPairManager")
	void slashclient$setProfileKeyPairManager(ProfileKeyPairManager manager);

	@Accessor("reportingContext")
	void slashclient$setReportingContext(ReportingContext context);

	@Mutable
	@Accessor("playerSocialManager")
	void slashclient$setPlayerSocialManager(PlayerSocialManager manager);

	// not in 1.20.1
	//#if MC >= 1.20.2
	@SuppressWarnings("rawtypes")
	@Mutable
	@Accessor("profileFuture")
	void slashclient$setProfileFuture(CompletableFuture profile);
	//#endif
}
