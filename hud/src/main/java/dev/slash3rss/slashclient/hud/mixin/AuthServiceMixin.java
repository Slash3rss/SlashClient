package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.authlib.minecraft.UserApiService;
import dev.slash3rss.slashclient.hud.account.AccountSwitch;
import net.minecraft.client.Minecraft;
import net.minecraft.client.main.GameConfig;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Keeps the login service the game starts with, to make sessions for other accounts later. */
@Mixin(Minecraft.class)
abstract class AuthServiceMixin {
	//#if MC >= 26.3
	@Inject(method = "createUserApiService", at = @At("HEAD"))
	private static void slashclient$keep(com.mojang.authlib.services.MinecraftServicesDiscoveryService service, GameConfig config, CallbackInfoReturnable<UserApiService> cir) {
		AccountSwitch.authService = service;
	}
	//#elif MC >= 26.2
	//$ @Inject(method = "createUserApiService", at = @At("HEAD"))
	//$ private static void slashclient$keep(com.mojang.authlib.yggdrasil.YggdrasilAuthenticationService service, GameConfig config, CallbackInfoReturnable<UserApiService> cir) {
	//$ 	AccountSwitch.authService = service;
	//$ }
	//#else
	//$ @Inject(method = "createUserApiService", at = @At("HEAD"))
	//$ private void slashclient$keep(com.mojang.authlib.yggdrasil.YggdrasilAuthenticationService service, GameConfig config, CallbackInfoReturnable<UserApiService> cir) {
	//$ 	AccountSwitch.authService = service;
	//$ }
	//#endif
}
