package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.components.ChatComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;

import java.util.List;

/** The chat's own lists, for stacking repeated lines and finding the line under the mouse. */
@Mixin(ChatComponent.class)
public interface ChatComponentAccessor {
	/** Every message, newest first. */
	@Accessor("allMessages")
	List<Object> slashclient$allMessages();

	/** The wrapped lines on screen, newest first. */
	@Accessor("trimmedMessages")
	List<Object> slashclient$lines();

	@Accessor("chatScrollbarPos")
	int slashclient$scroll();

	@Invoker("refreshTrimmedMessages")
	void slashclient$refresh();
}
